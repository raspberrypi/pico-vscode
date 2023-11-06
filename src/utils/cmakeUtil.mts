import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";
import {
  checkForRequirements,
  showRequirementsNotMetErrorMessage,
} from "./requirementsUtil.mjs";
import { join } from "path";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import { readFileSync } from "fs";
import Logger from "../logger.mjs";
import { readFile, writeFile } from "fs/promises";
import { rimraf, windows as rimrafWindows } from "rimraf";

export async function configureCmakeNinja(
  folder: Uri,
  settings: Settings
): Promise<boolean> {
  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: join(folder.fsPath, "CMakeLists.txt") })
    );

    const requirementsCheck = await checkForRequirements(settings);

    if (!requirementsCheck[0]) {
      void showRequirementsNotMetErrorMessage(requirementsCheck[1]);

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
        const cmake = settings.getString(SettingsKey.cmakePath) || "cmake";

        // TODO: analyze command result
        // TODO: option for the user to choose the generator
        // TODO: maybe delete the build folder before running cmake so
        // all configuration files in build get updates
        const child = exec(
          `${cmake} -DCMAKE_BUILD_TYPE=Debug ` +
            `-G Ninja -B ./build "${folder.fsPath}"`,
          {
            cwd: folder.fsPath,
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

/**
 * Updates the sdk and toolchain relay paths in the CMakeLists.txt file.
 *
 * @param folder The root folder of the workspace to configure.
 * @param newSDKVersion The verison in "$HOME/.picosdk/sdk/${newSDKVersion}"
 * @param newToolchainVersion The verison in "$HOME/.picosdk/toolchain/${newToolchainVersion}"
 */
export async function cmakeUpdateSDK(
  folder: Uri,
  settings: Settings,
  newSDKVersion: string,
  newToolchainVersion: string
): Promise<void> {
  // TODO: support for scaning for seperate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const sdkPathRegex = /^set\(PICO_SDK_PATH\s+([^)]+)\)$/m;
  const toolchainPathRegex = /^set\(PICO_TOOLCHAIN_PATH\s+([^)]+)\)$/m;

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(folder.with({ path: cmakeFilePath }));

    const content = await readFile(cmakeFilePath, "utf8");
    const modifiedContent = content
      .replace(
        sdkPathRegex,
        `set(PICO_SDK_PATH \${USERHOME}/.pico-sdk/sdk/${newSDKVersion})`
      )
      .replace(
        toolchainPathRegex,
        "set(PICO_TOOLCHAIN_PATH ${USERHOME}/.pico-sdk" +
          `/toolchain/${newToolchainVersion})`
      );

    await writeFile(cmakeFilePath, modifiedContent, "utf8");
    Logger.log("Updated paths in CMakeLists.txt successfully.");

    // reconfigure so .build gets updated
    if (process.platform === "win32") {
      await rimrafWindows(join(folder.fsPath, "build"), { maxRetries: 2 });
    } else {
      await rimraf(join(folder.fsPath, "build"), { maxRetries: 2 });
    }
    await configureCmakeNinja(folder, settings);

    Logger.log("Reconfigured CMake successfully.");
  } catch (error) {
    Logger.log("Error updating paths in CMakeLists.txt!");
  }
}

/**
 * Extracts the sdk and toolchain versions from the CMakeLists.txt file.
 *
 * @param cmakeFilePath The path to the CMakeLists.txt file.
 * @returns An tupple with the [sdk, toolchain] versions or null if the file could not
 * be read or the versions could not be extracted.
 */
export function cmakeGetSelectedToolchainAndSDKVersions(
  cmakeFilePath: string
): [string, string] | null {
  const content = readFileSync(cmakeFilePath, "utf8");
  const sdkPathRegex = /^set\(PICO_SDK_PATH\s+([^)]+)\)$/m;
  const toolchainPathRegex = /^set\(PICO_TOOLCHAIN_PATH\s+([^)]+)\)$/m;
  const match = content.match(sdkPathRegex);
  const match2 = content.match(toolchainPathRegex);

  if (match === null || match2 === null) {
    return null;
  }

  const path = match[1];
  const path2 = match2[1];
  const versionRegex = /^\${USERHOME}\/\.pico-sdk\/sdk\/([^)]+)$/m;
  const versionRegex2 = /^\${USERHOME}\/\.pico-sdk\/toolchain\/([^)]+)$/m;
  const versionMatch = path.match(versionRegex);
  const versionMatch2 = path2.match(versionRegex2);

  if (versionMatch === null || versionMatch2 === null) {
    return null;
  }

  return [versionMatch[1], versionMatch2[1]];
}
