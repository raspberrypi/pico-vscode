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
import { readFileSync, writeFileSync } from "fs";
import Logger from "../logger.mjs";

export async function configureCmakeNinja(
  folder: Uri,
  settings: Settings,
  envSuffix: string
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
        const child = exec(
          `${cmake} -DCMAKE_BUILD_TYPE=Debug ` +
            `-G Ninja -B ./build "${folder.fsPath}"`,
          {
            cwd: folder.fsPath,
            env: {
              ...(process.env as { [key: string]: string }),
              // eslint-disable-next-line @typescript-eslint/naming-convention
              [`PICO_SDK_PATH_${envSuffix}`]: sdkPaths?.[0],
              // eslint-disable-next-line @typescript-eslint/naming-convention
              [`PICO_TOOLCHAIN_PATH_${envSuffix}`]: sdkPaths?.[1],
            },
          }
        );

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

export function cmakeUpdateSuffix(
  cmakeFilePath: string,
  newSuffix: string
): void {
  const sdkPathRegex =
    /^set\(PICO_SDK_PATH \$ENV\{PICO_SDK_PATH_[A-Za-z0-9]+\}\)$/m;
  const toolchainPathRegex =
    /^set\(PICO_TOOLCHAIN_PATH \$ENV\{PICO_TOOLCHAIN_PATH_[A-Za-z0-9]+\}\)$/m;

  try {
    const content = readFileSync(cmakeFilePath, "utf8");
    const modifiedContent = content
      .replace(
        sdkPathRegex,
        `set(PICO_SDK_PATH $ENV{PICO_SDK_PATH_${newSuffix}})`
      )
      .replace(
        toolchainPathRegex,
        `set(PICO_TOOLCHAIN_PATH $ENV{PICO_TOOLCHAIN_PATH_${newSuffix}})`
      );

    writeFileSync(cmakeFilePath, modifiedContent, "utf8");
    Logger.log("Updated envSuffix in CMakeLists.txt successfully.");
  } catch (error) {
    Logger.log("Updating cmake envSuffix!");
  }
}
