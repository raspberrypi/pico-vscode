import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";
import { showRequirementsNotMetErrorMessage } from "./requirementsUtil.mjs";
import { dirname, join, resolve } from "path";
import Settings from "../settings.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import { existsSync, readFileSync, rmSync } from "fs";
import Logger from "../logger.mjs";
import { readFile, writeFile } from "fs/promises";
import { rimraf, windows as rimrafWindows } from "rimraf";
import { homedir } from "os";
import which from "which";
import { compareLtMajor } from "./semverUtil.mjs";

export async function getPythonPath(): Promise<string> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

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
    Logger.log("Error: Settings not initialized.");

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
  Logger.log(
    settings.getString(SettingsKey.python3Path)?.replace(HOME_VAR, homedir())
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
    Logger.log(errorMsg);
    await window.showErrorMessage(
      "Failed to configure cmake for the current project. " + errorMsg
    );

    return false;
  }

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return false;
  }

  if (settings.getBoolean(SettingsKey.useCmakeTools)) {
    await window.showErrorMessage(
      "You must use the CMake Tools extension to configure your build. " +
        "To use this extension instead, change the useCmakeTools setting."
    );

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
        console.warn(
          `Build directory has been moved from ${p1} to ${p2}` +
            ` - Deleting CMakeCache.txt and regenerating.`
        );

        rmSync(join(buildDir, "CMakeCache.txt"));
      }
    }
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: join(folder.fsPath, "CMakeLists.txt") })
    );

    void window.withProgress(
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
        // TODO: option for the user to choose the generator
        // TODO: maybe delete the build folder before running cmake so
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
          `${
            process.env.ComSpec === "powershell.exe" ? "&" : ""
          }"${cmake}" -DCMAKE_BUILD_TYPE=Debug ${
            pythonPath.includes("/")
              ? `-DPython3_EXECUTABLE="${pythonPath.replaceAll("\\", "/")}" `
              : ""
          }` + `-G Ninja -B ./build "${folder.fsPath}"`;

        const child = exec(
          command,
          {
            env: customEnv,
            cwd: folder.fsPath,
          },
          (error, stdout, stderr) => {
            if (error) {
              console.error(error);
              console.log(`stdout: ${stdout}`);
              console.log(`stderr: ${stderr}`);
            }

            return;
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
  // TODO: support for scaning for seperate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const picoBoardRegex = /^set\(PICO_BOARD\s+([^)]+)\)$/m;

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

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
    Logger.log("Updated board in CMakeLists.txt successfully.");

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

    return true;
  } catch {
    Logger.log("Error updating board in CMakeLists.txt!");

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
): Promise<boolean> {
  // TODO: support for scaning for seperate locations of the CMakeLists.txt file in the project
  const cmakeFilePath = join(folder.fsPath, "CMakeLists.txt");
  const sdkPathRegex = /^set\(PICO_SDK_PATH\s+([^)]+)\)$/m;
  const toolchainPathRegex = /^set\(PICO_TOOLCHAIN_PATH\s+([^)]+)\)$/m;
  const toolsPathRegex = /^set\(pico-sdk-tools_DIR\s+([^)]+)\)$/m;
  const picoBoardRegex = /^set\(PICO_BOARD\s+([^)]+)\)$/m;

  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return false;
  }

  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(folder.with({ path: cmakeFilePath }));

    const content = await readFile(cmakeFilePath, "utf8");

    let modifiedContent = content
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

    const picoBoard = content.match(picoBoardRegex);
    // update the PICO_BOARD variable if it's a pico2 board and the new sdk
    // version is less than 2.0.0
    if (
      picoBoard !== null &&
      picoBoard[1].includes("pico2") &&
      compareLtMajor(newSDKVersion, "2.0.0")
    ) {
      const result = await window.showQuickPick(["pico", "pico_w"], {
        placeHolder: "The new SDK version does not support your current board",
        canPickMany: false,
        ignoreFocusOut: true,
        title: "Please select a new board type",
      });

      if (result === undefined) {
        Logger.log("User canceled board type selection during SDK update.");

        return false;
      }

      modifiedContent = modifiedContent.replace(
        picoBoardRegex,
        `set(PICO_BOARD ${result} CACHE STRING "Board type")`
      );
    }

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

    return true;
  } catch {
    Logger.log("Error updating paths in CMakeLists.txt!");

    return false;
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
