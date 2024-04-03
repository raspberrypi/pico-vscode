import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";
import { showRequirementsNotMetErrorMessage } from "./requirementsUtil.mjs";
import { dirname, join } from "path";
import Settings from "../settings.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import { readFileSync } from "fs";
import Logger from "../logger.mjs";
import { readFile, writeFile } from "fs/promises";
import { rimraf, windows as rimrafWindows } from "rimraf";
import { homedir } from "os";
import which from "which";

export async function configureCmakeNinja(folder: Uri): Promise<boolean> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return false;
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: join(folder.fsPath, "CMakeLists.txt") })
    );

    const ninjaPath = (
      await which(
        settings
          .getString(SettingsKey.ninjaPath)
          ?.replace(HOME_VAR, homedir()) || "ninja",
        { nothrow: true }
      )
    ).replaceAll("\\", "/");
    const cmakePath = (
      await which(
        settings
          .getString(SettingsKey.cmakePath)
          ?.replace(HOME_VAR, homedir()) || "cmake",
        { nothrow: true }
      )
    ).replaceAll("\\", "/");
    Logger.log(
      settings.getString(SettingsKey.python3Path)?.replace(HOME_VAR, homedir())
    );
    // TODO: maybe also check for "python" on unix systems
    const pythonPath = (
      await which(
        settings
          .getString(SettingsKey.python3Path)
          ?.replace(HOME_VAR, homedir()) ||
          (process.platform === "win32" ? "python" : "python3"),
        { nothrow: true }
      )
    ).replaceAll("\\", "/");

    if (ninjaPath === null || cmakePath === null) {
      const missingTools = [];
      if (ninjaPath === null) {
        missingTools.push("Ninja");
      }
      if (cmakePath === null) {
        missingTools.push("CMake");
      }
      if (pythonPath === null) {
        missingTools.push("Python 3");
      }
      void showRequirementsNotMetErrorMessage(missingTools);

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
        const cmake =
          settings
            .getString(SettingsKey.cmakePath)
            ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) || "cmake";

        // TODO: analyze command result
        // TODO: option for the user to choose the generator
        // TODO: maybe delete the build folder before running cmake so
        // all configuration files in build get updates
        const customEnv = process.env;
        /*customEnv["PYTHONHOME"] = pythonPath.includes("/")
          ? resolve(join(dirname(pythonPath), ".."))
          : "";*/
        const isWindows = process.platform === "win32";
        customEnv[isWindows ? "Path" : "PATH"] = `${
          ninjaPath.includes("/") ? dirname(ninjaPath) : ""
        }${
          cmakePath.includes("/")
            ? `${isWindows ? ";" : ":"}${dirname(cmakePath)}`
            : ""
        }${
          pythonPath.includes("/")
            ? `${dirname(pythonPath)}${isWindows ? ";" : ":"}`
            : ""
        }${customEnv[isWindows ? "Path" : "PATH"]}`;

        const command =
          `${
            process.env.ComSpec === "powershell.exe" ? "&" : ""
          }"${cmake}" -DCMAKE_BUILD_TYPE=Debug ${
            pythonPath.includes("/")
              ? `-DPython3_EXECUTABLE="${pythonPath.replaceAll("\\", "/")}" `
              : ""
          }` + `-G Ninja -B ./build "${folder.fsPath}"`;

        const child = exec(command, {
          env: customEnv,
          cwd: folder.fsPath,
        }, (error, stdout, stderr) => {
          if (error) {
            console.error(error);
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
          }

          return;
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

/**
 * Updates the sdk and toolchain relay paths in the CMakeLists.txt file.
 *
 * @param folder The root folder of the workspace to configure.
 * @param newSDKVersion The verison in "$HOME/.picosdk/sdk/${newSDKVersion}"
 * @param newToolchainVersion The verison in "$HOME/.picosdk/toolchain/${newToolchainVersion}"
 */
export async function cmakeUpdateSDK(
  folder: Uri,
  newSDKVersion: string,
  newToolchainVersion: string
): Promise<void> {
  // TODO: support for scaning for seperate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const sdkPathRegex = /^set\(PICO_SDK_PATH\s+([^)]+)\)$/m;
  const toolchainPathRegex = /^set\(PICO_TOOLCHAIN_PATH\s+([^)]+)\)$/m;
  const toolsPathRegex = /^set\(pico-sdk-tools_DIR\s+([^)]+)\)$/m;

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return;
  }

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
      )
      .replace(
        toolsPathRegex,
        `set(pico-sdk-tools_DIR \${USERHOME}/.pico-sdk/tools/${newSDKVersion})`
      );

    await writeFile(cmakeFilePath, modifiedContent, "utf8");
    Logger.log("Updated paths in CMakeLists.txt successfully.");

    // reconfigure so .build gets updated
    // TODO: To get a behavior similar to the rm -rf Unix command,
    // use rmSync with options { recursive: true, force: true }
    // to remove rimraf requirement
    if (process.platform === "win32") {
      await rimrafWindows(join(folder.fsPath, "build"), { maxRetries: 2 });
    } else {
      await rimraf(join(folder.fsPath, "build"), { maxRetries: 2 });
    }
    await configureCmakeNinja(folder);

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
