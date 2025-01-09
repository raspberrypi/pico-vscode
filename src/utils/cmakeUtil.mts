import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";
import { showRequirementsNotMetErrorMessage } from "./requirementsUtil.mjs";
import { dirname, join, resolve } from "path";
import Settings from "../settings.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import { existsSync, readFileSync, rmSync } from "fs";
import Logger, { LoggerSource } from "../logger.mjs";
import { readFile, writeFile } from "fs/promises";
import { rimraf, windows as rimrafWindows } from "rimraf";
import { homedir } from "os";
import which from "which";
import { compareLt } from "./semverUtil.mjs";
import { buildCMakeIncPath } from "./download.mjs";

export const CMAKE_DO_NOT_EDIT_HEADER_PREFIX =
  // eslint-disable-next-line max-len
  "== DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==";
export const CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD =
// eslint-disable-next-line max-len
  "== DO NEVER EDIT THE NEXT LINES for Raspberry Pi Pico VS Code Extension to work ==";

export async function getPythonPath(): Promise<string> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.cmake, "Settings not initialized.");

    return "";
  }

  const pythonPath = (
    (await which(
      settings
        .getString(SettingsKey.python3Path)
        ?.replace(HOME_VAR, homedir()) ||
        (process.platform === "win32" ? "python" : "python3"),
      { nothrow: true }
    )) || ""
  ).replaceAll("\\", "/");

  return `${pythonPath.replaceAll("\\", "/")}`;
}

export async function getPath(): Promise<string> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.cmake, "Settings not initialized.");

    return "";
  }

  const ninjaPath = (
    (await which(
      settings.getString(SettingsKey.ninjaPath)?.replace(HOME_VAR, homedir()) ||
        "ninja",
      { nothrow: true }
    )) || ""
  ).replaceAll("\\", "/");
  const cmakePath = (
    (await which(
      settings.getString(SettingsKey.cmakePath)?.replace(HOME_VAR, homedir()) ||
        "cmake",
      { nothrow: true }
    )) || ""
  ).replaceAll("\\", "/");
  Logger.debug(
    LoggerSource.cmake,
    "Using python:",
    settings.getString(SettingsKey.python3Path)?.replace(HOME_VAR, homedir()) ??
      ""
  );
  // TODO: maybe also check for "python" on unix systems
  const pythonPath = await getPythonPath();

  if (ninjaPath.length === 0 || cmakePath.length === 0) {
    const missingTools = [];
    if (ninjaPath.length === 0) {
      missingTools.push("Ninja");
    }
    if (cmakePath.length === 0) {
      missingTools.push("CMake");
    }
    if (pythonPath.length === 0) {
      missingTools.push("Python 3");
    }
    void showRequirementsNotMetErrorMessage(missingTools);

    return "";
  }

  const isWindows = process.platform === "win32";

  return `${ninjaPath.includes("/") ? dirname(ninjaPath) : ""}${
    cmakePath.includes("/")
      ? `${isWindows ? ";" : ":"}${dirname(cmakePath)}`
      : ""
  }${
    pythonPath.includes("/")
      ? `${dirname(pythonPath)}${isWindows ? ";" : ":"}`
      : ""
  }`;
}

export async function configureCmakeNinja(folder: Uri): Promise<boolean> {
  if (process.platform !== "win32" && folder.fsPath.includes("\\")) {
    const errorMsg =
      "CMake currently does not support folder names with backslashes.";

    Logger.error(LoggerSource.cmake, errorMsg);

    await window.showErrorMessage(
      "Failed to configure cmake for the current project. " + errorMsg
    );

    return false;
  }

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.cmake, "Settings not initialized.");

    return false;
  }

  if (existsSync(join(folder.fsPath, "build", "CMakeCache.txt"))) {
    // check if the build directory has been moved

    const buildDir = join(folder.fsPath, "build");

    const cacheBuildDir = cmakeGetPicoVar(
      join(buildDir, "CMakeCache.txt"),
      "CMAKE_CACHEFILE_DIR"
    );

    if (cacheBuildDir !== null) {
      let p1 = resolve(buildDir);
      let p2 = resolve(cacheBuildDir);
      if (process.platform === "win32") {
        p1 = p1.toLowerCase();
        p2 = p2.toLowerCase();
      }

      if (p1 !== p2) {
        Logger.warn(
          LoggerSource.cmake,
          `Build directory has been moved from ${p1} to ${p2}` +
            ` - Deleting CMakeCache.txt and regenerating.`
        );

        rmSync(join(buildDir, "CMakeCache.txt"));
      }
    }
  }

  if (settings.getBoolean(SettingsKey.useCmakeTools)) {
    // CMake Tools integration is enabled - skip configuration
    Logger.info(
      LoggerSource.cmake,
      "Skipping CMake configuration, as useCmakeTools is set."
    );

    return false;
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: join(folder.fsPath, "CMakeLists.txt") })
    );

    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: true,
        title: "Configuring CMake...",
      },
      async (progress, token) => {
        const cmake =
          settings
            .getString(SettingsKey.cmakePath)
            ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) || "cmake";

        // TODO: analyze command result
        // all configuration files in build get updates
        const customEnv = process.env;
        /*customEnv["PYTHONHOME"] = pythonPath.includes("/")
          ? resolve(join(dirname(pythonPath), ".."))
          : "";*/
        const isWindows = process.platform === "win32";
        const customPath = await getPath();
        if (!customPath) {
          return false;
        }
        customEnv[isWindows ? "Path" : "PATH"] =
          customPath + customEnv[isWindows ? "Path" : "PATH"];
        const pythonPath = await getPythonPath();

        const command =
          `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${cmake}" ${
            pythonPath.includes("/")
              ? `-DPython3_EXECUTABLE="${pythonPath.replaceAll("\\", "/")}" `
              : ""
          }` + `-G Ninja -B ./build "${folder.fsPath}"`;

        await new Promise<void>((resolve, reject) => {
          // use exec to be able to cancel the process
          const child = exec(
            command,
            {
              env: customEnv,
              cwd: folder.fsPath,
            },
            error => {
              progress.report({ increment: 100 });
              if (error) {
                if (error.signal === "SIGTERM") {
                  Logger.warn(
                    LoggerSource.cmake,
                    "CMake configuration process was canceled."
                  );
                } else {
                  Logger.error(
                    LoggerSource.cmake,
                    `Failed to configure CMake:`,
                    error
                  );
                }

                reject(error);
              }

              resolve();
            }
          );

          token.onCancellationRequested(() => {
            child.kill();
          });
        });
      }
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Changes the board in the CMakeLists.txt file.
 *
 * @param folder The root folder of the workspace to configure.
 * @param newBoard The new board to use
 */
export async function cmakeUpdateBoard(
  folder: Uri,
  newBoard: string
): Promise<boolean> {
  // TODO: support for scanning for separate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const picoBoardRegex = /^set\(PICO_BOARD\s+([^)]+)\)$/m;

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.cmake, "Settings not initialized.");

    return false;
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(folder.with({ path: cmakeFilePath }));

    const content = await readFile(cmakeFilePath, "utf8");

    const modifiedContent = content.replace(
      picoBoardRegex,
      `set(PICO_BOARD ${newBoard} CACHE STRING "Board type")`
    );

    await writeFile(cmakeFilePath, modifiedContent, "utf8");
    Logger.info(
      LoggerSource.cmake,
      "Updated board in CMakeLists.txt successfully."
    );

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
    Logger.info(LoggerSource.cmake, "Reconfigured CMake successfully.");

    return true;
  } catch {
    Logger.error(
      LoggerSource.cmake,
      "Updating board in CMakeLists.txt failed!"
    );

    return false;
  }
}

/**
 * Updates the sdk and toolchain relay paths in the CMakeLists.txt file.
 *
 * @param folder The root folder of the workspace to configure.
 * @param newSDKVersion The version in "$HOME/.picosdk/sdk/${newSDKVersion}"
 * @param newToolchainVersion The version in "$HOME/.picosdk/toolchain/${newToolchainVersion}"
 */
export async function cmakeUpdateSDK(
  folder: Uri,
  newSDKVersion: string,
  newToolchainVersion: string,
  newPicotoolVersion: string,
  reconfigure: boolean = true
): Promise<boolean> {
  // TODO: support for scanning for separate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  // This regex requires multiline (m) and dotall (s) flags to work
  const updateSectionRegex = new RegExp(
    `^# (${CMAKE_DO_NOT_EDIT_HEADER_PREFIX}` +
    `|${CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD}).*# =+$`,
    "ms"
  );
  const picoBoardRegex = /^set\(PICO_BOARD\s+([^)]+)\)$/m;

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.cmake, "Settings not initialized.");

    return false;
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(folder.with({ path: cmakeFilePath }));

    const content = await readFile(cmakeFilePath, "utf8");

    let modifiedContent = content.replace(
      updateSectionRegex,
      `# ${CMAKE_DO_NOT_EDIT_HEADER_PREFIX}\n` +
        "if(WIN32)\n" +
        "    set(USERHOME $ENV{USERPROFILE})\n" +
        "else()\n" +
        "    set(USERHOME $ENV{HOME})\n" +
        "endif()\n" +
        `set(sdkVersion ${newSDKVersion})\n` +
        `set(toolchainVersion ${newToolchainVersion})\n` +
        `set(picotoolVersion ${newPicotoolVersion})\n` +
        `set(picoVscode ${buildCMakeIncPath(false)}/pico-vscode.cmake)\n` +
        "if (EXISTS ${picoVscode})\n" +
        "    include(${picoVscode})\n" +
        "endif()\n" +
        // eslint-disable-next-line max-len
        "# ===================================================================================="
    );

    const picoBoard = content.match(picoBoardRegex);
    // update the PICO_BOARD variable if it's a pico2 board and the new sdk
    // version is less than 2.0.0, or pico2_w and new version <2.1.0
    if (
      picoBoard !== null &&
      ((picoBoard[1].includes("pico2") &&
      compareLt(newSDKVersion, "2.0.0")) ||
      (picoBoard[1].includes('pico2_w') &&
      compareLt(newSDKVersion, "2.1.0")))
    ) {
      const quickPickItems = ["pico", "pico_w"];
      if (!compareLt(newSDKVersion, "2.0.0")) {
        quickPickItems.push("pico2");
      }
      if (!compareLt(newSDKVersion, "2.1.0")) {
        quickPickItems.push("pico2_w");
      }
      const result = await window.showQuickPick(quickPickItems, {
        placeHolder: "The new SDK version does not support your current board",
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Please select a new board type",
      });

      if (result === undefined) {
        Logger.warn(
          LoggerSource.cmake,
          "User canceled board type selection during SDK update."
        );

        return false;
      }

      modifiedContent = modifiedContent.replace(
        picoBoardRegex,
        `set(PICO_BOARD ${result} CACHE STRING "Board type")`
      );
    }

    await writeFile(cmakeFilePath, modifiedContent, "utf8");
    Logger.debug(
      LoggerSource.cmake,
      "Updated paths in CMakeLists.txt successfully."
    );

    if (reconfigure) {
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
      Logger.info(LoggerSource.cmake, "Reconfigured CMake successfully.");
    }

    return true;
  } catch {
    Logger.error(
      LoggerSource.cmake,
      "Updating paths in CMakeLists.txt failed!"
    );

    return false;
  }
}

/**
 * Extracts the sdk and toolchain versions from the CMakeLists.txt file.
 *
 * @param cmakeFilePath The path to the CMakeLists.txt file.
 * @returns A tuple with the [sdk, toolchain, picotool] versions or null if the file could not
 * be read or the versions could not be extracted.
 */
export async function cmakeGetSelectedToolchainAndSDKVersions(
  folder: Uri
): Promise<[string, string, string] | null> {
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const content = readFileSync(cmakeFilePath, "utf8");

  // 0.15.1 and before
  const sdkPathRegex = /^set\(PICO_SDK_PATH\s+([^)]+)\)$/m;
  const toolchainPathRegex = /^set\(PICO_TOOLCHAIN_PATH\s+([^)]+)\)$/m;
  const oldMatch = content.match(sdkPathRegex);
  const oldMatch2 = content.match(toolchainPathRegex);

  // Current
  const sdkVersionRegex = /^set\(sdkVersion\s+([^)]+)\)$/m;
  const toolchainVersionRegex = /^set\(toolchainVersion\s+([^)]+)\)$/m;
  const picotoolVersionRegex = /^set\(picotoolVersion\s+([^)]+)\)$/m;
  const match = content.match(sdkVersionRegex);
  const match2 = content.match(toolchainVersionRegex);
  const match3 = content.match(picotoolVersionRegex);

  if (match !== null && match2 !== null && match3 !== null) {
    return [match[1], match2[1], match3[1]];
  } else if (oldMatch !== null && oldMatch2 !== null) {
    const path = oldMatch[1];
    const path2 = oldMatch2[1];
    const versionRegex = /^\${USERHOME}\/\.pico-sdk\/sdk\/([^)]+)$/m;
    const versionRegex2 = /^\${USERHOME}\/\.pico-sdk\/toolchain\/([^)]+)$/m;
    const versionMatch = path.match(versionRegex);
    const versionMatch2 = path2.match(versionRegex2);

    if (versionMatch === null || versionMatch2 === null) {
      return null;
    }

    Logger.debug(LoggerSource.cmake, "Updating extension lines in CMake file");
    await cmakeUpdateSDK(
      folder,
      versionMatch[1],
      versionMatch2[1],
      versionMatch[1]
    );
    Logger.debug(LoggerSource.cmake, "Extension lines updated");

    return [versionMatch[1], versionMatch2[1], versionMatch[1]];
  } else {
    return null;
  }
}

/**
 * Extracts the board from the CMakeLists.txt file.
 *
 * @param cmakeFilePath The path to the CMakeLists.txt file.
 * @returns An string with the board or null if the file could not
 * be read or the board could not be extracted.
 */
export function cmakeGetSelectedBoard(folder: Uri): string | null {
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const content = readFileSync(cmakeFilePath, "utf8");

  const picoBoardRegex = /^set\(PICO_BOARD\s+([^)]+)\)$/m;

  const match = content.match(picoBoardRegex);

  if (match !== null) {
    const board = match[1].split("CACHE")[0].trim();

    if (board === null) {
      return null;
    }

    return board;
  } else {
    return null;
  }
}

/**
 * Extracts the picoVar from the CMakeCache.txt file.
 *
 * @param cmakeFilePath The path to the CMakeCache.txt file.
 * @returns The variable or null if the file could not
 * be read or the variable could not be extracted.
 */
export function cmakeGetPicoVar(
  cmakeFilePath: string,
  picoVar: string
): string | null {
  const content = readFileSync(cmakeFilePath, "utf8");
  const picoVarRegex = new RegExp(`^${picoVar}:.*=(.*)$`, "m");
  const match = content.match(picoVarRegex);

  if (match === null) {
    return null;
  }

  return match[1];
}
