import { existsSync } from "fs";
import { window, workspace, ProgressLocation, Uri } from "vscode";
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
} from "../utils/download.mjs";
import Settings, { HOME_VAR } from "../settings.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import { ensureGit } from "../utils/gitUtil.mjs";
import VersionBundlesLoader, { type VersionBundle } from "./versionBundles.mjs";
import {
  CURRENT_DTC_VERSION,
  CURRENT_GPERF_VERSION,
  CURRENT_WGET_VERSION,
  LICENSE_URL_7ZIP,
  OPENOCD_VERSION,
  WINDOWS_X86_7ZIP_DOWNLOAD_URL,
  WINDOWS_X86_DTC_DOWNLOAD_URL,
  WINDOWS_X86_GPERF_DOWNLOAD_URL,
  WINDOWS_X86_WGET_DOWNLOAD_URL,
} from "./sharedConstants.mjs";
import { SDK_REPOSITORY_URL } from "./githubREST.mjs";
import { vsExists } from "./vsHelpers.mjs";
import which from "which";

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

function buildWgetPath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "wget",
    version
  );
}

function build7ZipPathWin32(): string {
  return join(homeDirectory, ".pico-sdk", "7zip");
}

function generateCustomEnv(
  isWindows: boolean,
  latestVb: VersionBundle,
  cmakeExe: string,
  pythonExe: string
): NodeJS.ProcessEnv {
  const customEnv = process.env;

  const customPath = [
    dirname(cmakeExe),
    join(homedir(), ".pico-sdk", "dtc", CURRENT_DTC_VERSION, "bin"),
    // TODO: better git path
    join(homedir(), ".pico-sdk", "git", "cmd"),
    join(homedir(), ".pico-sdk", "gperf", CURRENT_GPERF_VERSION, "bin"),
    join(homedir(), ".pico-sdk", "ninja", latestVb.ninja),
    dirname(pythonExe),
    join(homedir(), ".pico-sdk", "wget", CURRENT_WGET_VERSION),
    join(homedir(), ".pico-sdk", "7zip"),
    "", // Need this to add separator to end
  ].join(process.platform === "win32" ? ";" : ":");

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
      ((process.env.ComSpec === "powershell.exe" ||
        process.env.ComSpec ===
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe") &&
      command.startsWith('"')
        ? "&"
        : "") + command,
      options,
      (error, stdout, stderr) => {
        Logger.debug(LoggerSource.zephyrSetup, stdout);
        Logger.debug(LoggerSource.zephyrSetup, stderr);
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

async function checkGit(): Promise<string | undefined> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.zephyrSetup, "Settings not initialized.");

    return;
  }

  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Ensuring Git is available",
      cancellable: false,
    },
    async progress2 => {
      // TODO: this does take about 2s - may be reduced
      const gitPath = await ensureGit(settings, { returnPath: true });
      if (typeof gitPath !== "string" || gitPath.length === 0) {
        progress2.report({
          message: "Failed",
          increment: 100,
        });

        return;
      }

      progress2.report({
        message: "Success",
        increment: 100,
      });

      return gitPath;
    }
  );
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

      return joinPosix(buildNinjaPath(ninjaVersion), "bin", "ninja");
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

async function checkWget(): Promise<boolean> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing wget",
      cancellable: false,
    },
    async progress2 => {
      const result = await downloadAndInstallArchive(
        WINDOWS_X86_WGET_DOWNLOAD_URL,
        buildWgetPath(CURRENT_WGET_VERSION),
        `wget-${CURRENT_WGET_VERSION}-win64.zip`,
        "wget"
      );

      if (result) {
        progress2.report({
          message: "Successfully downloaded and installed wget.",
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

async function checkMacosLinuxDeps(isWindows: boolean): Promise<boolean> {
  if (isWindows) {
    return true;
  }

  const wget = await which("wget", { nothrow: true });
  if (!wget) {
    void window.showErrorMessage(
      "wget not found in PATH. Please install wget " +
        "and make sure it is available in PATH."
    );

    return false;
  }
  const dtc = await which("dtc", { nothrow: true });
  if (!dtc) {
    void window.showErrorMessage(
      "dtc (Device Tree Compiler) not found in PATH. Please install dtc " +
        "and make sure it is available in PATH."
    );

    return false;
  }
  const gperf = await which("gperf", { nothrow: true });
  if (!gperf) {
    void window.showErrorMessage(
      "gperf not found in PATH. Please install gperf " +
        "and make sure it is available in PATH."
    );

    return false;
  }

  return true;
}

async function checkWindowsDeps(isWindows: boolean): Promise<boolean> {
  if (!isWindows) {
    return true;
  }

  let installedSuccessfully = await checkDtc();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install DTC. Cannot continue Zephyr setup."
    );

    return false;
  }

  installedSuccessfully = await checkGperf();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install gperf. Cannot continue Zephyr setup."
    );

    return false;
  }

  installedSuccessfully = await checkWget();
  if (!installedSuccessfully) {
    void window.showErrorMessage(
      "Failed to install wget. Cannot continue Zephyr setup."
    );

    return false;
  }

  installedSuccessfully = await check7Zip();
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
  data: ZephyrSetupValue
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

  let isWindows = false;
  const endResult: boolean = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Setting up Zephyr Toolchain",
    },
    async progress => {
      let installedSuccessfully = true;

      const gitPath = await checkGit();
      if (gitPath === undefined) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }
      output.gitPath = gitPath;

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
      const sdk = await checkSdk(latestVb, python3Path);
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

      isWindows = process.platform === "win32";

      installedSuccessfully = await checkWindowsDeps(isWindows);
      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return false;
      }

      installedSuccessfully = await checkMacosLinuxDeps(isWindows);
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
      const customEnv = generateCustomEnv(
        isWindows,
        latestVb[1],
        output.cmakeExecutable,
        pythonExe
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

      await workspace.fs.writeFile(
        Uri.file(zephyrManifestFile),
        Buffer.from(zephyrManifestContent)
      );

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
          // was -b ${zephyrWorkspaceDirectory} which results in zephyr-sdk-<version> in it
          const westInstallSDKCommand: string =
            `"${westExe}" sdk install ` +
            `-t arm-zephyr-eabi -d "${zephyrWorkspaceDirectory}/zephyr-sdk"`;

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
