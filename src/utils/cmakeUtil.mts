import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";
import {
  checkForRequirements,
  showRquirementsNotMetErrorMessage,
} from "./requirementsUtil.mjs";
import { join } from "path";
import { getSDKAndToolchainPath } from "./picoSDKUtil.mjs";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";

export async function configureCmakeNinja(
  folder: Uri,
  settings: Settings
): Promise<boolean> {
  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: join(folder.fsPath, "CMakeLists.txt") })
    );

    const rquirementsAvailable = await checkForRequirements(settings);

    if (!rquirementsAvailable) {
      void showRquirementsNotMetErrorMessage();

      return false;
    }

    void window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: true,
        title: "Configuring CMake...",
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (progress, token) => {
        const sdkPaths = await getSDKAndToolchainPath(settings);
        const cmake = settings.getString(SettingsKey.cmakePath) || "cmake";

        // TODO: analyze command result
        // TODO: option for the user to choose the generator
        const child = exec(`${cmake} -G Ninja -B ./build "${folder.fsPath}"`, {
          cwd: folder.fsPath,
          env: {
            ...process.env,
            // TODO: set PICO_SDK_PATH
            // eslint-disable-next-line @typescript-eslint/naming-convention
            PICO_SDK_PATH: sdkPaths?.[0],
            // eslint-disable-next-line @typescript-eslint/naming-convention
            PICO_TOOLCHAIN_PATH: sdkPaths?.[1],
          },
        });

        child.on("error", err => {
          console.error(err);
        });

        //child.stdout?.on("data", data => {});
        child.on("close", () => {
          progress.report({ increment: 100 });
        });
        child.on("exit", code => {
          if (code !== 0) {
            console.error(`CMake exited with code ${code ?? "unknown"}`);
          }
          progress.report({ increment: 100 });
        });

        token.onCancellationRequested(() => {
          child.kill();
        });
      }
    );

    return true;
  } catch (e) {
    return false;
  }
}
