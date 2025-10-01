import { existsSync } from "fs";
import { window, workspace, ProgressLocation, Uri, env } from "vscode";
import { type ExecOptions, exec } from "child_process";
import { dirname, join } from "path";
import { join as joinPosix } from "path/posix";
import { homedir } from "os";
import Logger, { LoggerSource } from "../logger.mjs";
import type { Progress as GotProgress } from "got";

import {
  buildCMakePath,
  buildNinjaPath,
  buildZephyrWorkspacePath,
  downloadAndInstallArchive,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadAndInstallSDK,
  downloadFileGot,
} from "./download.mjs";
import Settings, { HOME_VAR, SettingsKey } from "../settings.mjs";
import findPython, { showPythonNotFoundError } from "./pythonHelper.mjs";
import { checkGitWithProgress } from "./gitUtil.mjs";
import VersionBundlesLoader, { type VersionBundle } from "./versionBundles.mjs";
import {
  CURRENT_DTC_VERSION,
  CURRENT_GPERF_VERSION,
  LICENSE_URL_7ZIP,
  OPENOCD_VERSION,
  SDK_REPOSITORY_URL,
  WINDOWS_X86_7ZIP_DOWNLOAD_URL,
  WINDOWS_X86_DTC_DOWNLOAD_URL,
  WINDOWS_X86_GPERF_DOWNLOAD_URL,
} from "./sharedConstants.mjs";
import { vsExists } from "./vsHelpers.mjs";
import which from "which";
import { stdoutToString, unknownErrorToString } from "./errorHelper.mjs";
import { VALID_ZEPHYR_BOARDS } from "../models/zephyrBoards.mjs";
import type { ITask } from "../models/task.mjs";
import { configureCmakeNinja } from "./cmakeUtil.mjs";

interface ZephyrSetupValue {
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;
  extUri: Uri;
  ninjaMode: number;
  ninjaPath: string;
  ninjaVersion: string;
}

interface ZephyrSetupOutputs {
  cmakeExecutable: string;
  ninjaExecutable: string;
  gitPath: string;
  latestVb: [string, VersionBundle];
}

// Compute and cache the home directory
const homeDirectory: string = homedir();

const zephyrManifestContent: string = `
manifest:
  self:
    west-commands: scripts/west-commands.yml

  remotes:
    - name: zephyrproject-rtos
      url-base: https://github.com/zephyrproject-rtos

  projects:
    - name: zephyr
      remote: zephyrproject-rtos
      revision: main
      path: zephyr-main
      import:
        # By using name-allowlist we can clone only the modules that are
        # strictly needed by the application.
        name-allowlist:
          - cmsis_6      # required by the ARM Cortex-M port
          - hal_rpi_pico # required for Pico board support
          - hal_infineon # required for Wifi chip support
          - segger       # required for Segger RTT support
`;

// TODO: maybe move into download.mts
function buildDtcPath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "dtc",
    version
  );
}

function buildGperfPath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "gperf",
    version
  );
}

function build7ZipPathWin32(): string {
  return join(homeDirectory, ".pico-sdk", "7zip");
}

export function generateCustomZephyrEnv(
  isWindows: boolean,
  cmakeExe: string,
  ninjaExe: string,
  pythonExe: string,
  gitExe?: string
): NodeJS.ProcessEnv {
  const customEnv = process.env;

  const customPath = [
    dirname(cmakeExe),
    //join(homedir(), ".pico-sdk", "dtc", CURRENT_DTC_VERSION, "bin"),
    gitExe !== undefined
      ? dirname(gitExe)
      : join(homedir(), ".pico-sdk", "git", "cmd"),
    join(homedir(), ".pico-sdk", "wget"),
    //join(homedir(), ".pico-sdk", "gperf", CURRENT_GPERF_VERSION, "bin"),
    dirname(ninjaExe),
    dirname(pythonExe),
    join(homedir(), ".pico-sdk", "7zip"),
    "", // Need this to add separator to end
  ]
    // filter out entries that come from paths that ref a bin that is already in PATH
    .filter(item => item !== ".")
    .join(isWindows ? ";" : ":");

  customEnv[isWindows ? "Path" : "PATH"] =
    customPath + customEnv[isWindows ? "Path" : "PATH"];

  return customEnv;
}

// TODO: duplicate code with _runGenerator
function _runCommand(
  command: string,
  options: ExecOptions
): Promise<number | null> {
  Logger.debug(LoggerSource.zephyrSetup, `Running: ${command}`);

  return new Promise<number | null>(resolve => {
    const proc = exec(
      (process.env.ComSpec?.endsWith("powershell.exe") &&
      command.startsWith('"')
        ? "&"
        : "") + command,
      options,
      (error, stdout, stderr) => {
        Logger.debug(LoggerSource.zephyrSetup, stdoutToString(stdout));
        Logger.debug(LoggerSource.zephyrSetup, stdoutToString(stderr));
        if (error) {
          Logger.error(
            LoggerSource.zephyrSetup,
            `An error occurred executing a command: ${error.message}`
          );
          resolve(null); // indicate error
        }
      }
    );

    proc.on("exit", code => {
      // Resolve with exit code or -1 if code is undefined
      resolve(code);
    });
  });
}

async function checkCmake(
  cmakeMode: number,
  cmakeVersion: string,
  cmakePath: string
): Promise<string | undefined> {
  let progLastState = 0;
  let installedSuccessfully = false;

  switch (cmakeMode) {
    case 4:
    case 2:
      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing CMake",
          cancellable: false,
        },
        async progress => {
          const result = await downloadAndInstallCmake(
            cmakeVersion,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress.report({
                increment: per - progLastState,
              });
              progLastState = per;
            }
          );

          if (!result) {
            progress.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }

          progress.report({
            message: "Success",
            increment: 100,
          });

          return true;
        }
      );

      if (!installedSuccessfully) {
        return;
      }

      return joinPosix(buildCMakePath(cmakeVersion), "bin", "cmake");
    case 1:
      // Don't need to add anything to path if already available via system
      return "";
    case 3:
      // normalize path returned by the os selector to posix path for the settings json
      // and cross platform compatibility
      return process.platform === "win32"
        ? // TODO: maybe use path.sep for split
          joinPosix(...cmakePath.split("\\"))
        : cmakePath;
    default:
      void window.showErrorMessage("Unknown CMake version selected.");

      return;
  }
}

async function checkNinja(
  ninjaMode: number,
  ninjaVersion: string,
  ninjaPath: string
): Promise<string | undefined> {
  let progLastState = 0;
  let installedSuccessfully = false;

  switch (ninjaMode) {
    case 4:
    case 2:
      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Ninja",
          cancellable: false,
        },
        async progress => {
          const result = await downloadAndInstallNinja(
            ninjaVersion,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress.report({
                increment: per - progLastState,
              });
              progLastState = per;
            }
          );

          if (!result) {
            progress.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }

          progress.report({
            message: "Success",
            increment: 100,
          });

          return true;
        }
      );

      if (!installedSuccessfully) {
        return;
      }

      return joinPosix(buildNinjaPath(ninjaVersion), "ninja");
    case 1:
      // Don't need to add anything to path if already available via system
      return "";
    case 3:
      // normalize path returned by the os selector to posix path for the settings json
      // and cross platform compatibility
      return process.platform === "win32"
        ? // TODO: maybe use path.sep for split
          joinPosix(...ninjaPath.split("\\"))
        : ninjaPath;
    default:
      void window.showErrorMessage("Unknown Ninja version selected.");

      return;
  }
}

async function checkPicotool(latestVb: VersionBundle): Promise<boolean> {
  let progLastState = 0;

  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing Picotool",
      cancellable: false,
    },
    async progress => {
      if (
        await downloadAndInstallPicotool(
          latestVb.picotool,
          (prog: GotProgress) => {
            const per = prog.percent * 100;
            progress.report({
              increment: per - progLastState,
            });
            progLastState = per;
          }
        )
      ) {
        progress.report({
          message: "Success",
          increment: 100,
        });

        return true;
      } else {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }
    }
  );
}

async function checkSdk(
  extensionUri: Uri,
  latestVb: [string, VersionBundle],
  python3Path: string
): Promise<boolean> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing Pico SDK",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallSDK(
        extensionUri,
        latestVb[0],
        SDK_REPOSITORY_URL,
        python3Path
      );

      if (!result) {
        Logger.error(
          LoggerSource.zephyrSetup,
          "Failed to download and install the Pico SDK."
        );

        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      } else {
        progress.report({
          message: "Success",
          increment: 100,
        });

        return true;
      }
    }
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkDtc(): Promise<boolean> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing DTC",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallArchive(
        WINDOWS_X86_DTC_DOWNLOAD_URL,
        buildDtcPath(CURRENT_DTC_VERSION),
        "dtc-msys2-1.6.1-x86_64.zip",
        "dtc"
      );

      if (!result) {
        Logger.error(
          LoggerSource.zephyrSetup,
          "Failed to download and install DTC."
        );

        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      } else {
        progress.report({
          message: "Success",
          increment: 100,
        });

        return true;
      }
    }
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkGperf(): Promise<boolean> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing gperf",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallArchive(
        WINDOWS_X86_GPERF_DOWNLOAD_URL,
        buildGperfPath(CURRENT_GPERF_VERSION),
        `gperf-${CURRENT_GPERF_VERSION}-win64_x64.zip`,
        "gperf"
      );

      if (!result) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      } else {
        progress.report({
          message: "Success",
          increment: 100,
        });

        return true;
      }
    }
  );
}

async function setupFakeWget(extensionUri: Uri): Promise<boolean> {
  const wgetUri = Uri.file(join(homeDirectory, ".pico-sdk", "wget"));

  try {
    await workspace.fs.createDirectory(wgetUri);

    const scriptName = process.platform === "win32" ? "wget.cmd" : "wget.sh";
    const scriptSource = Uri.joinPath(extensionUri, "scripts", scriptName);

    await workspace.fs.copy(scriptSource, Uri.joinPath(wgetUri, scriptName), {
      overwrite: true,
    });

    return true;
  } catch (e) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to create fake wget script: ${unknownErrorToString(e)}`
    );
    void window.showErrorMessage(
      "Failed to create fake wget script. Cannot continue Zephyr setup."
    );

    return false;
  }
}

async function check7Zip(): Promise<boolean> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing 7-Zip",
      cancellable: false,
    },
    async progress => {
      Logger.info(LoggerSource.zephyrSetup, "Installing 7-Zip...");
      const installDir = build7ZipPathWin32();

      if (await vsExists(installDir)) {
        const installDirContents = await workspace.fs.readDirectory(
          Uri.file(installDir)
        );

        if (installDirContents.length !== 0) {
          Logger.info(LoggerSource.zephyrSetup, "7-Zip is already installed.");

          progress.report({
            message: "7-Zip already installed.",
            increment: 100,
          });

          return true;
        }
      } else {
        await workspace.fs.createDirectory(Uri.file(installDir));
      }

      const licenseURL = new URL(LICENSE_URL_7ZIP);
      const licenseTarget = join(installDir, "License.txt");
      const licenseResult = await downloadFileGot(licenseURL, licenseTarget);
      if (!licenseResult) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      const downloadURL = new URL(WINDOWS_X86_7ZIP_DOWNLOAD_URL);
      // rename latest 7zr.exe to 7z.exe for compaibility with Zephyr installer script
      const downloadTarget = join(installDir, "7z.exe");
      const result = await downloadFileGot(downloadURL, downloadTarget);

      if (!result) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      progress.report({
        message: "Success",
        increment: 100,
      });

      return true;
    }
  );
}

async function showNoWgetError(): Promise<void> {
  const response = await window.showErrorMessage(
    "wget not found in Path. Please install wget and ensure " +
      "it is available in PATH. " +
      "See the Zephyr notes in the pico-vscode README for guidance.",
    "Open README"
  );
  if (response === "Open README") {
    await env.openExternal(
      Uri.parse(
        // eslint-disable-next-line max-len
        "https://github.com/raspberrypi/pico-vscode/tree/main?tab=readme-ov-file#zephyr-notes"
      )
    );
  }
}

async function checkMacosLinuxDeps(extensionUri: Uri): Promise<boolean> {
  if (process.platform === "win32") {
    return true;
  }

  const result = await setupFakeWget(extensionUri);
  if (!result) {
    const wget = await which("wget", { nothrow: true });
    if (!wget) {
      await showNoWgetError();

      return false;
    }
  }

  return true;
}

async function checkWindowsDeps(extensionUri: Uri): Promise<boolean> {
  if (process.platform !== "win32") {
    return true;
  }

  // Would only be required for additional DT output verification
  /*let installedSuccessfully = await checkDtc();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install DTC. Cannot continue Zephyr setup."
    );

    return false;
  }*/

  // Only required once CONFIG_USERSPACE support is enabled for RP2350
  /*installedSuccessfully = await checkGperf();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install gperf. Cannot continue Zephyr setup."
    );

    return false;
  }*/

  const fakeWget = await setupFakeWget(extensionUri);
  if (!fakeWget) {
    const wget = await which("wget", { nothrow: true });
    if (!wget) {
      await showNoWgetError();

      return false;
    }
  }

  const installedSuccessfully = await check7Zip();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install 7-Zip. Cannot continue Zephyr setup."
    );

    return false;
  }

  return true;
}

async function checkOpenOCD(): Promise<boolean> {
  let progLastState = 0;

  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing OpenOCD",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallOpenOCD(
        OPENOCD_VERSION,
        (prog: GotProgress) => {
          const per = prog.percent * 100;
          progress.report({
            increment: per - progLastState,
          });
          progLastState = per;
        }
      );

      if (result) {
        progress.report({
          message: "Success",
          increment: 100,
        });

        return true;
      } else {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }
    }
  );
}

export async function setupZephyr(
  data: ZephyrSetupValue,
  gitExe?: string
): Promise<ZephyrSetupOutputs | undefined> {
  Logger.info(LoggerSource.zephyrSetup, "Setting up Zephyr...");

  const latestVb = await new VersionBundlesLoader(data.extUri).getLatest();
  if (latestVb === undefined) {
    Logger.error(
      LoggerSource.zephyrSetup,
      "Failed to get latest version bundles."
    );
    void window.showErrorMessage(
      "Failed to get latest version bundles. Cannot continue Zephyr setup."
    );

    return;
  }

  const output: ZephyrSetupOutputs = {
    cmakeExecutable: "",
    ninjaExecutable: "",
    gitPath: "",
    latestVb,
  };

  const endResult: boolean = await window.withProgress(
    {
      location: ProgressLocation.Window,
      title: "Setting up Zephyr Toolchain",
    },
    async progress => {
      let installedSuccessfully = true;

      if (gitExe === undefined) {
        const gitPath = await checkGitWithProgress();
        if (gitPath === undefined) {
          progress.report({
            message: "Failed",
            increment: 100,
          });

          return false;
        }
        output.gitPath = gitPath;
      } else {
        output.gitPath = gitExe;
      }

      // Handle CMake install
      const cmakePath = await checkCmake(
        data.cmakeMode,
        data.cmakeVersion,
        data.cmakePath
      );
      if (cmakePath === undefined) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage(
          "Failed to install or find CMake. Cannot continue Zephyr setup."
        );

        return false;
      }
      output.cmakeExecutable = cmakePath;

      const ninjaPath = await checkNinja(
        data.ninjaMode,
        data.ninjaVersion,
        data.ninjaPath
      );
      if (ninjaPath === undefined) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage(
          "Failed to install or find Ninja. Cannot continue Zephyr setup."
        );

        return false;
      }
      output.ninjaExecutable = ninjaPath;

      installedSuccessfully = await checkPicotool(latestVb[1]);
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage(
          "Failed to install Picotool. Cannot continue Zephyr setup."
        );

        return false;
      }

      // install python (if necessary)
      const python3Path = await findPython();
      if (!python3Path) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        Logger.error(
          LoggerSource.zephyrSetup,
          "Failed to find Python3 executable."
        );
        showPythonNotFoundError();

        return false;
      }

      // required for svd files
      const sdk = await checkSdk(data.extUri, latestVb, python3Path);
      if (!sdk) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage(
          "Failed to install Pico SDK. Cannot continue Zephyr setup."
        );

        return false;
      }

      installedSuccessfully = await checkWindowsDeps(data.extUri);
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      installedSuccessfully = await checkMacosLinuxDeps(data.extUri);
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      installedSuccessfully = await checkOpenOCD();
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage(
          "Failed to install OpenOCD. Cannot continue Zephyr setup."
        );

        return false;
      }

      const pythonExe = python3Path?.replace(
        HOME_VAR,
        homedir().replaceAll("\\", "/")
      );
      const customEnv = generateCustomZephyrEnv(
        process.platform === "win32",
        output.cmakeExecutable,
        output.ninjaExecutable,
        pythonExe,
        gitExe
      );

      const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();
      const zephyrManifestDir: string = joinPosix(
        zephyrWorkspaceDirectory,
        "manifest"
      );
      const zephyrManifestFile: string = joinPosix(
        zephyrManifestDir,
        "west.yml"
      );

      // only overwrite if it does not exist
      try {
        await workspace.fs.stat(Uri.file(zephyrManifestFile));
      } catch {
        await workspace.fs.writeFile(
          Uri.file(zephyrManifestFile),
          Buffer.from(zephyrManifestContent)
        );
      }

      const createVenvCommandVenv: string = `"${pythonExe}" -m venv venv`;
      const createVenvCommandVirtualenv: string =
        `"${pythonExe}" -m ` + "virtualenv venv";

      // Create a Zephyr workspace, copy the west manifest in and initialise the workspace
      await workspace.fs.createDirectory(Uri.file(zephyrWorkspaceDirectory));

      // Generic result to get value from runCommand calls
      let result: number | null;
      const venvPython: string = joinPosix(
        zephyrWorkspaceDirectory,
        "venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "python.exe" : "python"
      );

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Setup Python virtual environment for Zephyr",
          cancellable: false,
        },
        async progress2 => {
          if (existsSync(venvPython)) {
            Logger.info(
              LoggerSource.zephyrSetup,
              "Existing Python virtual environment for Zephyr found."
            );

            return true;
          }

          result = await _runCommand(createVenvCommandVenv, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });
          if (result !== 0) {
            Logger.warn(
              LoggerSource.zephyrSetup,
              "Could not create virtual environment with venv," +
                "trying with virtualenv..."
            );

            result = await _runCommand(createVenvCommandVirtualenv, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            });

            if (result !== 0) {
              progress2.report({
                message: "Failed",
                increment: 100,
              });

              return false;
            }
          }

          progress2.report({
            message: "Success",
            increment: 100,
          });

          Logger.info(
            LoggerSource.zephyrSetup,
            "Zephyr Python virtual environment created."
          );

          return true;
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      const venvPythonCommand: string = joinPosix(
        process.env.ComSpec === "powershell.exe" ? "&" : "",
        venvPython
      );

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Install Zephyr Python dependencies",
          cancellable: false,
        },
        async progress2 => {
          const installWestCommand: string =
            `${venvPythonCommand} -m pip install ` + "west pyelftools";

          const installExitCode = await _runCommand(installWestCommand, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });
          if (installExitCode === 0) {
            progress2.report({
              message: "Success",
              increment: 100,
            });

            return true;
          } else {
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      const westExe: string = joinPosix(
        zephyrWorkspaceDirectory,
        "venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "west.exe" : "west"
      );

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Setting up West workspace",
          cancellable: false,
        },
        async progress2 => {
          const zephyrWorkspaceFiles = await workspace.fs.readDirectory(
            Uri.file(zephyrWorkspaceDirectory)
          );

          const westAlreadyExists = zephyrWorkspaceFiles.find(
            x => x[0] === ".west"
          );
          if (westAlreadyExists) {
            Logger.info(
              LoggerSource.zephyrSetup,
              "West workspace already initialised."
            );
          } else {
            Logger.info(
              LoggerSource.zephyrSetup,
              "No West workspace found. Initialising..."
            );

            const westInitCommand: string = `"${westExe}" init -l manifest`;
            result = await _runCommand(westInitCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            });

            Logger.info(
              LoggerSource.zephyrSetup,
              `West workspace initialization ended with exit code ${result}.`
            );

            if (result !== 0) {
              progress2.report({
                message: "Failed",
                increment: 100,
              });

              return false;
            }
          }

          const westUpdateCommand: string = `"${westExe}" update`;
          result = await _runCommand(westUpdateCommand, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });

          if (result === 0) {
            progress2.report({
              message: "Success",
              increment: 100,
            });

            return true;
          } else {
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      const zephyrExportCommand: string = `"${westExe}" zephyr-export`;
      Logger.info(LoggerSource.zephyrSetup, "Exporting Zephyr CMake Files...");

      // TODO: maybe progress
      result = await _runCommand(zephyrExportCommand, {
        cwd: zephyrWorkspaceDirectory,
        windowsHide: true,
        env: customEnv,
      });
      if (result !== 0) {
        Logger.error(
          LoggerSource.zephyrSetup,
          "Error exporting Zephyr CMake files."
        );
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage("Error exporting Zephyr CMake files.");

        return false;
      }

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Installing West Python dependencies",
          cancellable: false,
        },
        async progress2 => {
          const westPipPackagesCommand: string =
            `"${westExe}" packages ` + "pip --install";

          result = await _runCommand(westPipPackagesCommand, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });

          if (result === 0) {
            Logger.debug(
              LoggerSource.zephyrSetup,
              "West Python dependencies installed."
            );
            progress2.report({
              message: "Success",
              increment: 100,
            });

            return true;
          } else {
            Logger.error(
              LoggerSource.zephyrSetup,
              "Error installing West Python dependencies."
            );
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Fetching Zephyr binary blobs",
          cancellable: false,
        },
        async progress2 => {
          const westBlobsFetchCommand: string =
            `"${westExe}" blobs fetch ` + "hal_infineon";

          result = await _runCommand(westBlobsFetchCommand, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });

          if (result === 0) {
            progress2.report({
              message: "Success",
              increment: 100,
            });

            return true;
          } else {
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      installedSuccessfully = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Installing Zephyr SDK",
          cancellable: false,
        },
        async progress2 => {
          // was  which results in zephyr-sdk-<version> in it
          let westInstallSDKCommand: string = `"${westExe}" sdk install `;

          const githubPat = Settings.getInstance()?.getString(
            SettingsKey.githubToken
          );
          if (githubPat && githubPat.length !== 0) {
            Logger.info(
              LoggerSource.zephyrSetup,
              "Found GitHub PAT in extension settings - " +
                "Using it for Zephyr SDK download."
            );
            westInstallSDKCommand += `--personal-access-token ${githubPat} `;
          }
          //`-d "${zephyrWorkspaceDirectory}/zephyr-sdk"`;
          westInstallSDKCommand +=
            // -b ${} results in zephyr-sdk-<version> folder
            `-t arm-zephyr-eabi -b "${zephyrWorkspaceDirectory}"`;

          result = await _runCommand(westInstallSDKCommand, {
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });

          if (result === 0) {
            progress2.report({
              message: "Success",
              increment: 100,
            });

            return true;
          } else {
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return false;
          }
        }
      );
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      progress.report({
        message: "Complete",
        increment: 100,
      });

      return true;
    }
  );

  if (endResult) {
    Logger.info(LoggerSource.zephyrSetup, "Zephyr setup complete.");

    return output;
  } else {
    Logger.error(LoggerSource.zephyrSetup, "Zephyr setup failed.");

    return undefined;
  }
}

/**
 * Reads and parses the tasks.json file at the given path.
 * If a overwriteBoard is provided, it will replace the board in the tasks.json file.
 *
 * @param tasksJsonPath The path to the tasks.json file.
 * @param overwriteBoard The board to overwrite in the tasks.json file.
 * @returns The current board if found, otherwise undefined.
 */
export async function zephyrTouchTasksJson(
  tasksJsonPath: string | Uri,
  overwriteBoard?: string
): Promise<string | undefined> {
  const tasksUri =
    typeof tasksJsonPath === "string" ? Uri.file(tasksJsonPath) : tasksJsonPath;

  try {
    await workspace.fs.stat(tasksUri);

    const td = new TextDecoder("utf-8");
    const tasksJson = JSON.parse(
      td.decode(await workspace.fs.readFile(tasksUri))
    ) as { tasks: ITask[] };

    const compileTask = tasksJson.tasks.find(
      t => t.label === "Compile Project"
    );
    if (compileTask === undefined) {
      return undefined;
    }

    // find index of -b in the args and then thing after it should match on of the board strings
    const bIndex = compileTask.args.findIndex(a => a === "-b");
    if (bIndex === -1 || bIndex === compileTask.args.length - 1) {
      return undefined;
    }

    let currentBoard = compileTask.args[bIndex + 1];

    if (overwriteBoard !== undefined) {
      if (!VALID_ZEPHYR_BOARDS.includes(currentBoard)) {
        const cont = await window.showWarningMessage(
          `Current board "${currentBoard}" is not a known ` +
            "Zephyr board. Do you want to continue?",
          {
            modal: true,
          },
          "Continue",
          "Cancel"
        );

        if (cont !== "Continue") {
          return;
        }
      }

      compileTask.args[bIndex + 1] = overwriteBoard;
      currentBoard = overwriteBoard;
      const te = new TextEncoder();
      await workspace.fs.writeFile(
        tasksUri,
        te.encode(JSON.stringify(tasksJson, null, 2))
      );
    }

    if (VALID_ZEPHYR_BOARDS.includes(currentBoard)) {
      return currentBoard;
    } else {
      return undefined;
    }
  } catch (error) {
    Logger.log(
      `Failed to read tasks.json file: ${unknownErrorToString(error)}`
    );
    void window.showErrorMessage(
      "Failed to read tasks.json file. " +
        "Make sure the file exists and has a Compile Project task."
    );

    return undefined;
  }
}

export async function getBoardFromZephyrProject(
  tasksJsonPath: string
): Promise<string | undefined> {
  return zephyrTouchTasksJson(tasksJsonPath);
}

export async function updateZephyrVersion(gitTag: string): Promise<boolean> {
  const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();
  const zephyrManifestDir: string = joinPosix(
    zephyrWorkspaceDirectory,
    "manifest"
  );
  const zephyrManifestFile: string = joinPosix(zephyrManifestDir, "west.yml");

  try {
    await workspace.fs.stat(Uri.file(zephyrManifestFile));

    const td = new TextDecoder("utf-8");
    const manifest = td.decode(
      await workspace.fs.readFile(Uri.file(zephyrManifestFile))
    );
    const manifestLines = manifest.split("\n");

    // update zephyr git revision to the new git tag
    const revLineIndex = manifestLines.findIndex(line =>
      line.match(/^\s*revision:\s*.*$/)
    );
    if (revLineIndex === -1) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find revision line in west manifest file."
      );
      void window.showErrorMessage(
        "Failed to find revision line in west manifest file. " +
          "Cannot update Zephyr version."
      );

      return false;
    }

    manifestLines[revLineIndex] = manifestLines[revLineIndex].replace(
      /(^\s*revision:\s*).*(\s*$)/,
      `$1${gitTag}$2`
    );

    // update path where to clone zephyr to
    const pathLineIndex = manifestLines.findIndex(line =>
      line.match(/^\s*path:\s*zephyr-.*$/)
    );
    if (pathLineIndex === -1) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find path line in west manifest file."
      );
      void window.showErrorMessage(
        "Failed to find path line in west manifest file. " +
          "Cannot update Zephyr version."
      );

      return false;
    }

    manifestLines[pathLineIndex] = manifestLines[pathLineIndex].replace(
      /(^\s*path:\s*zephyr-).*(\s*$)/,
      `$1${gitTag}$2`
    );

    const te = new TextEncoder();
    await workspace.fs.writeFile(
      Uri.file(zephyrManifestFile),
      te.encode(manifestLines.join("\n"))
    );
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read west manifest file: ${unknownErrorToString(error)}`
    );
    void window.showErrorMessage(
      "Failed to read west manifest file. " +
        "Make sure the Zephyr workspace is correctly setup."
    );

    return false;
  }

  return updateWestConfig(gitTag);
}

export async function getZephyrVersion(): Promise<string | undefined> {
  const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();
  const zephyrManifestDir: string = joinPosix(
    zephyrWorkspaceDirectory,
    "manifest"
  );
  const zephyrManifestFile: string = joinPosix(zephyrManifestDir, "west.yml");

  try {
    await workspace.fs.stat(Uri.file(zephyrManifestFile));
    const td = new TextDecoder("utf-8");
    const manifest = td.decode(
      await workspace.fs.readFile(Uri.file(zephyrManifestFile))
    );
    const manifestLines = manifest.split("\n");
    // find <some spaces>revision: <version> kind of line and get version
    const revLine = manifestLines.find(line =>
      line.match(/^\s*revision:\s*.*$/)
    );
    if (revLine === undefined) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find revision line in west manifest file."
      );
      void window.showErrorMessage(
        "Failed to find revision line in west manifest file. " +
          "Cannot get Zephyr version."
      );

      return undefined;
    }
    const match = revLine.match(/^\s*revision:\s*(.*)\s*$/);
    if (match && match[1]) {
      return match[1];
    }

    return undefined;
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read west manifest file: ${unknownErrorToString(error)}`
    );
    void window.showErrorMessage(
      "Failed to read west manifest file. " +
        "Make sure the Zephyr workspace is correctly setup."
    );

    return undefined;
  }
}

export async function getZephyrSDKVersion(
  zephyrVersion?: string
): Promise<string | undefined> {
  const zVersion = zephyrVersion ?? (await getZephyrVersion());
  if (zVersion === undefined) {
    void window.showErrorMessage(
      "Failed to get Zephyr version. Cannot get Zephyr SDK version."
    );

    return undefined;
  }

  const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();
  const sdkVersionFile = joinPosix(
    zephyrWorkspaceDirectory,
    `zephyr-${zephyrVersion}`,
    "SDK_VERSION"
  );

  try {
    await workspace.fs.stat(Uri.file(sdkVersionFile));
    const td = new TextDecoder("utf-8");
    const sdkVersion = td
      .decode(await workspace.fs.readFile(Uri.file(sdkVersionFile)))
      .trim();

    return sdkVersion;
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read Zephyr SDK version file: ${unknownErrorToString(error)}`
    );
    void window.showErrorMessage(
      "Failed to read Zephyr SDK version file. " +
        "Make sure the Zephyr workspace is correctly setup."
    );

    return undefined;
  }
}

export async function updateWestConfig(
  newZephyrVersion: string
): Promise<boolean> {
  const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();
  const westConfigFile: string = joinPosix(
    zephyrWorkspaceDirectory,
    ".west",
    "config"
  );

  try {
    await workspace.fs.stat(Uri.file(westConfigFile));

    const td = new TextDecoder("utf-8");
    const westConfig = td.decode(
      await workspace.fs.readFile(Uri.file(westConfigFile))
    );
    const westConfigLines = westConfig.split("\n");

    const baseLineIndex = westConfigLines.findIndex(line =>
      line.match(/^\s*base\s*=\s*zephyr(-.*)?\s*$/)
    );
    if (baseLineIndex === -1) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find base line in west config file."
      );
      void window.showErrorMessage(
        "Failed to find base line in west config file. " +
          "Cannot update Zephyr version."
      );

      return false;
    }
    westConfigLines[baseLineIndex] = westConfigLines[baseLineIndex].replace(
      /(^\s*base\s*=\s*zephyr)(-.*)?(\s*$)/,
      `$1-${newZephyrVersion}$3`
    );

    const te = new TextEncoder();
    await workspace.fs.writeFile(
      Uri.file(westConfigFile),
      te.encode(westConfigLines.join("\n"))
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read west config file: ${unknownErrorToString(error)}`
    );
    void window.showErrorMessage(
      "Failed to read west config file. " +
        "Make sure the Zephyr workspace is correctly setup."
    );

    return false;
  }
}

export async function updateZephyrCompilerPath(
  workspaceUri: Uri,
  zephyrVersion?: string
): Promise<boolean> {
  const sdkVersion = await getZephyrSDKVersion(zephyrVersion);
  if (sdkVersion === undefined) {
    void window.showErrorMessage(
      "Failed to get Zephyr version. Cannot update Zephyr compiler path."
    );

    return false;
  }

  const cppPropertiesUri = Uri.joinPath(
    workspaceUri,
    ".vscode",
    "c_cpp_properties.json"
  );

  try {
    await workspace.fs.stat(cppPropertiesUri);

    const td = new TextDecoder("utf-8");
    const cppProperties = JSON.parse(
      td.decode(await workspace.fs.readFile(cppPropertiesUri))
    ) as {
      configurations: Array<{
        name: string;
        compilerPath: string;
        includePath: string[];
        forcedInclude: string[];
      }>;
    };

    // check for zerphyr config
    const zephyrConfig = cppProperties.configurations.find(
      c => c.name === "Zephyr"
    );
    if (zephyrConfig === undefined) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find Zephyr configuration in c_cpp_properties.json file."
      );
      void window.showErrorMessage(
        "Failed to find Zephyr configuration in c_cpp_properties.json file. " +
          "Cannot update Zephyr version."
      );

      return false;
    }

    // update /zephyr_workspace/zephyr-sdk-<version>/arm-zephyr-eabi
    const sdkPathMatch = zephyrConfig.compilerPath.match(
      /(.*\/zephyr-sdk-)[^/]*(\/arm-zephyr-eabi.*)/
    );
    if (!sdkPathMatch || sdkPathMatch.length !== 3) {
      Logger.error(
        LoggerSource.zephyrSetup,
        "Failed to find Zephyr SDK path in c_cpp_properties.json file."
      );
      void window.showErrorMessage(
        "The compiler path in c_cpp_properties.json does not seem to " +
          "contain a Zephyr SDK path. Cannot update Zephyr version."
      );

      return false;
    }
    zephyrConfig.compilerPath =
      `${sdkPathMatch[1]}` + `${sdkVersion}${sdkPathMatch[2]}`;

    for (let i = 0; i < zephyrConfig.includePath.length; i++) {
      const incPathMatch = zephyrConfig.includePath[i].match(
        /(.*\/zephyr_workspace\/zephyr-)[^/]*(\/.*)/
      );
      if (incPathMatch && incPathMatch.length === 3) {
        zephyrConfig.includePath[i] =
          `${incPathMatch[1]}` + `${zephyrVersion}${incPathMatch[2]}`;
      }
    }

    for (let i = 0; i < zephyrConfig.forcedInclude.length; i++) {
      const incPathMatch = zephyrConfig.forcedInclude[i].match(
        /(.*\/zephyr_workspace\/zephyr-)[^/]*(\/.*)/
      );
      if (incPathMatch && incPathMatch.length === 3) {
        zephyrConfig.forcedInclude[i] =
          `${incPathMatch[1]}` + `${zephyrVersion}${incPathMatch[2]}`;
      }
    }

    const te = new TextEncoder();
    await workspace.fs.writeFile(
      cppPropertiesUri,
      te.encode(JSON.stringify(cppProperties, null, 2))
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read c_cpp_properties.json file: ${unknownErrorToString(
        error
      )}`
    );
    void window.showErrorMessage(
      "Failed to read c_cpp_properties.json file. " +
        "Make sure the file exists and has a Zephyr configuration."
    );

    return false;
  }
}

export async function zephyrVerifyCMakCache(
  workspaceUri: Uri,
  zephyrVersion?: string
): Promise<void> {
  const zephyrVer = zephyrVersion ?? (await getZephyrVersion());
  if (zephyrVer === undefined) {
    void window.showErrorMessage(
      "Failed to get Zephyr version. Cannot verify CMake cache."
    );

    return;
  }

  const cmakeCacheUri = Uri.joinPath(workspaceUri, "build", "CMakeCache.txt");
  try {
    await workspace.fs.stat(cmakeCacheUri);

    const td = new TextDecoder("utf-8");
    const cmakeCache = td.decode(await workspace.fs.readFile(cmakeCacheUri));
    const cmakeCacheLines = cmakeCache.split("\n");

    // check if ZEPHYR_BASE:PATH line ends with zephyr_workspace/zephyr-<currentZephyrVersion>
    // if not remove build folder
    const zBaseLine = cmakeCacheLines
      .find(line => line.startsWith("ZEPHYR_BASE:PATH="))
      ?.trim();

    if (zBaseLine !== undefined) {
      const match = zBaseLine.match(/ZEPHYR_BASE:PATH=.*(zephyr-.*)$/);
      if (match && match[1]) {
        const currentZephyrVersion = match[1].replace("zephyr-", "");
        if (currentZephyrVersion === zephyrVer) {
          // only way to not have to drop the build folder
          return;
        }
      }
    }

    // drop build folder
    const buildDir = Uri.joinPath(workspaceUri, "build");
    try {
      await workspace.fs.stat(buildDir);
      await workspace.fs.delete(buildDir, { recursive: true, useTrash: false });
      Logger.info(
        LoggerSource.zephyrSetup,
        "Deleted build folder to clear old Zephyr CMake cache."
      );
      void window.showInformationMessage(
        "Deleted build folder to clear old Zephyr CMake cache."
      );

      if (await configureCmakeNinja(workspaceUri)) {
        void window.showInformationMessage(
          "Reconfigured CMake and Ninja for Zephyr project."
        );
      } else {
        void window.showErrorMessage(
          "Failed to reconfigure CMake and Ninja for Zephyr project."
        );
      }
    } catch {
      // does not exist
    }

    return;
  } catch (error) {
    Logger.error(
      LoggerSource.zephyrSetup,
      `Failed to read CMake cache file: ${unknownErrorToString(error)}`
    );

    return;
  }
}
