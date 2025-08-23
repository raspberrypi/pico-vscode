import { existsSync, readdirSync, rmSync } from "fs";
import { window, workspace, ProgressLocation, Uri } from "vscode";
import { type ExecOptions, exec, spawnSync } from "child_process";
import { dirname } from "path";
import { join as joinPosix } from "path/posix";
import { homedir } from "os";
import Logger from "../logger.mjs";
import type { Progress as GotProgress } from "got";

import {
  buildCMakePath,
  buildZephyrWorkspacePath,
  downloadAndInstallArchive,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadFileGot,
} from "../utils/download.mjs";
import Settings, { HOME_VAR } from "../settings.mjs";
import { openOCDVersion } from "../webview/newProjectPanel.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import { ensureGit } from "../utils/gitUtil.mjs";
import { type VersionBundle } from "../utils/versionBundles.mjs";

const _logger = new Logger("zephyrSetup");

const zephyrManifestContent: string = `
manifest:
  self:
    west-commands: scripts/west-commands.yml

  remotes:
    - name: zephyrproject-rtos
      url-base: https://github.com/magpieembedded

  projects:
    - name: zephyr
      remote: zephyrproject-rtos
      revision: pico2w
      import:
        # By using name-allowlist we can clone only the modules that are
        # strictly needed by the application.
        name-allowlist:
          - cmsis_6      # required by the ARM Cortex-M port
          - hal_rpi_pico # required for Pico board support
          - hal_infineon # required for Wifi chip support
`;

interface ZephyrSetupValue {
  versionBundle: VersionBundle | undefined;
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;
}

interface ZephyrSetupOutputs {
  cmakeExecutable: string;
}

function _runCommand(
  command: string,
  options: ExecOptions
): Promise<number | null> {
  _logger.debug(`Running: ${command}`);

  return new Promise<number | null>(resolve => {
    const generatorProcess = exec(command, options, (error, stdout, stderr) => {
      _logger.debug(stdout);
      _logger.info(stderr);
      if (error) {
        _logger.error(`Setup venv error: ${error.message}`);
        resolve(null); // indicate error
      }
    });

    generatorProcess.on("exit", code => {
      // Resolve with exit code or -1 if code is undefined
      resolve(code);
    });
  });
}

export async function setupZephyr(
  data: ZephyrSetupValue
): Promise<ZephyrSetupOutputs | undefined> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    _logger.error("Settings not initialized.");

    return;
  }

  let output: ZephyrSetupOutputs = { cmakeExecutable: "" };

  let python3Path = "";
  let isWindows = false;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Setting up Zephyr Toolchain",
    },
    async progress => {
      let installedSuccessfully = true;
      let prog2LastState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Ensuring Git is available",
          cancellable: false,
        },
        async progress2 => {
          // TODO: this does take about 2s - may be reduced
          const gitPath = await ensureGit(settings, { returnPath: true });
          if (typeof gitPath !== "string" || gitPath.length === 0) {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return;
          }
          progress2.report({
            message: "Git setup correctly.",
            increment: 100,
          });
          installedSuccessfully = true;
        }
      );

      // Handle CMake install
      switch (data.cmakeMode) {
        case 0:
          if (data.versionBundle !== undefined) {
            data.cmakeVersion = data.versionBundle.cmake;
          }
        // eslint-disable-next-line no-fallthrough
        case 2:
          installedSuccessfully = false;
          prog2LastState = 0;
          await window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: "Download and install CMake",
              cancellable: false,
            },
            async progress2 => {
              if (
                await downloadAndInstallCmake(
                  data.cmakeVersion,
                  (prog: GotProgress) => {
                    const per = prog.percent * 100;
                    progress2.report({
                      increment: per - prog2LastState,
                    });
                    prog2LastState = per;
                  }
                )
              ) {
                progress.report({
                  // TODO: maybe just finished or something like that
                  message: "Successfully downloaded and installed CMake.",
                  increment: 100,
                });

                installedSuccessfully = true;
              } else {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });
              }
            }
          );

          if (!installedSuccessfully) {
            progress.report({
              message: "Failed",
              increment: 100,
            });
            void window.showErrorMessage(
              // TODO: maybe remove all requirements met part
              "Failed to download and install CMake.\
              Make sure all requirements are met."
            );

            return;
          } else {
            const cmakeVersionBasePath = buildCMakePath(data.cmakeVersion);

            output.cmakeExecutable = joinPosix(
              cmakeVersionBasePath,
              "bin",
              "cmake"
            );
          }
          break;
        case 1:
          // Don't need to add anything to path if already available via system
          output.cmakeExecutable = "";
          break;
        case 3:
          // normalize path returned by the os selector to posix path for the settings json
          // and cross platform compatibility
          output.cmakeExecutable =
            process.platform === "win32"
              ? // TODO: maybe use path.sep for split
                joinPosix(...data.cmakePath.split("\\"))
              : data.cmakePath;
          break;
        default:
          progress.report({
            message: "Failed",
            increment: 100,
          });
          void window.showErrorMessage("Unknown cmake selection.");

          return;
      }
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Download and install Ninja",
          cancellable: false,
        },
        async progress2 => {
          if (
            await downloadAndInstallNinja("v1.12.1", (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            })
          ) {
            progress2.report({
              message: "Successfully downloaded and installed Ninja.",
              increment: 100,
            });

            installedSuccessfully = true;
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Download and install Picotool",
          cancellable: false,
        },
        async progress2 => {
          if (
            await downloadAndInstallPicotool("2.1.1", (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            })
          ) {
            progress2.report({
              message: "Successfully downloaded and installed Picotool.",
              increment: 100,
            });

            installedSuccessfully = true;
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Set up Python",
          cancellable: false,
        },
        async progress2 => {
          python3Path = await findPython();
          if (!python3Path) {
            _logger.error("Failed to find Python3 executable.");
            showPythonNotFoundError();

            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }

          progress2.report({
            message: "Successfully downloaded and installed Picotool.",
            increment: 100,
          });

          installedSuccessfully = true;
        }
      );

      isWindows = process.platform === "win32";

      if (isWindows) {
        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: "Download and install DTC",
            cancellable: false,
          },
          async progress2 => {
            if (
              await downloadAndInstallArchive(
                "https://github.com/oss-winget/oss-winget-storage/raw/" +
                  "96ea1b934342f45628a488d3b50d0c37cf06012c/packages/dtc/" +
                  "1.6.1/dtc-msys2-1.6.1-x86_64.zip",
                joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "dtc"),
                "dtc-msys2-1.6.1-x86_64.zip",
                "dtc"
              )
            ) {
              progress2.report({
                message: "Successfully downloaded and installed DTC.",
                increment: 100,
              });

              installedSuccessfully = true;
            } else {
              installedSuccessfully = false;
              progress2.report({
                message: "Failed",
                increment: 100,
              });
            }
          }
        );

        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: "Download and install gperf",
            cancellable: false,
          },
          async progress2 => {
            if (
              await downloadAndInstallArchive(
                "https://sourceforge.net/projects/gnuwin32/files/gperf/3.0.1/" +
                  "gperf-3.0.1-bin.zip/download",
                joinPosix(
                  homedir().replaceAll("\\", "/"),
                  ".pico-sdk",
                  "gperf"
                ),
                "gperf-3.0.1-bin.zip",
                "gperf"
              )
            ) {
              progress2.report({
                message: "Successfully downloaded and installed DTC.",
                increment: 100,
              });

              installedSuccessfully = true;
            } else {
              installedSuccessfully = false;
              progress2.report({
                message: "Failed",
                increment: 100,
              });
            }
          }
        );

        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: "Download and install wget",
            cancellable: false,
          },
          async progress2 => {
            if (
              await downloadAndInstallArchive(
                "https:///eternallybored.org/misc/wget/releases/" +
                  "wget-1.21.4-win64.zip",
                joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget"),
                "wget-1.21.4-win64.zip",
                "wget"
              )
            ) {
              progress2.report({
                message: "Successfully downloaded and installed wget.",
                increment: 100,
              });

              installedSuccessfully = true;
            } else {
              installedSuccessfully = false;
              progress2.report({
                message: "Failed",
                increment: 100,
              });
            }
          }
        );

        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: "Download and install 7-zip",
            cancellable: false,
          },
          async progress2 => {
            _logger.info("Installing 7zip");
            const szipTargetDirectory = joinPosix("C:\\Program Files\\7-Zip");
            if (
              existsSync(szipTargetDirectory) &&
              readdirSync(szipTargetDirectory).length !== 0
            ) {
              _logger.info("7-Zip is already installed.");
              progress2.report({
                message: "7-zip already installed.",
                increment: 100,
              });
            } else {
              const szipURL = new URL("https://7-zip.org/a/7z2409-x64.exe");
              const szipResult = await downloadFileGot(
                szipURL,
                joinPosix(
                  homedir().replaceAll("\\", "/"),
                  ".pico-sdk",
                  "7zip-x64.exe"
                )
              );

              if (!szipResult) {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });

                return;
              }

              const szipCommand: string = "7zip-x64.exe";
              const szipInstallResult = await _runCommand(szipCommand, {
                cwd: joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk"),
              });

              if (szipInstallResult !== 0) {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });

                return;
              }

              // Clean up
              rmSync(
                joinPosix(
                  homedir().replaceAll("\\", "/"),
                  ".pico-sdk",
                  "7zip-x64.exe"
                )
              );

              progress2.report({
                message: "Successfully downloaded and installed 7-zip.",
                increment: 100,
              });

              installedSuccessfully = true;
            }
          }
        );
      }

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Download and install OpenOCD",
          cancellable: false,
        },
        async progress2 => {
          if (
            await downloadAndInstallOpenOCD(
              openOCDVersion,
              (prog: GotProgress) => {
                const per = prog.percent * 100;
                progress2.report({
                  increment: per - prog2LastState,
                });
                prog2LastState = per;
              }
            )
          ) {
            progress2.report({
              message: "Successfully downloaded and installed Picotool.",
              increment: 100,
            });

            installedSuccessfully = true;
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      const pythonExe = python3Path.replace(
        HOME_VAR,
        homedir().replaceAll("\\", "/")
      );

      const customEnv = process.env;

      const customPath = [
        dirname(output.cmakeExecutable.replaceAll("\\", "/")),
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "dtc", "bin"),
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "git", "cmd"),
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "gperf", "bin"),
        joinPosix(
          homedir().replaceAll("\\", "/"),
          ".pico-sdk",
          "ninja",
          "v1.12.1"
        ),
        joinPosix(
          homedir().replaceAll("\\", "/"),
          ".pico-sdk",
          "python",
          "3.12.6"
        ),
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget"),
        joinPosix("C:\\Program Files".replaceAll("\\", "/"), "7-Zip"),
        "", // Need this to add separator to end
      ].join(process.platform === "win32" ? ";" : ":");

      _logger.info(`New path: ${customPath}`);

      customPath.replaceAll("/", "\\");
      customEnv[isWindows ? "Path" : "PATH"] =
        customPath + customEnv[isWindows ? "Path" : "PATH"];

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

      const createVenvCommandVenv: string = [
        `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
        "-m venv venv",
      ].join(" ");
      const createVenvCommandVirtualenv: string = [
        `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
        "-m virtualenv venv",
      ].join(" ");

      // Create a Zephyr workspace, copy the west manifest in and initialise the workspace
      workspace.fs.createDirectory(Uri.file(zephyrWorkspaceDirectory));

      // Generic result to get value from runCommand calls
      let result: number | null;

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Setup Python virtual environment for Zephyr",
          cancellable: false,
        },
        async progress2 => {
          const venvPython: string = joinPosix(
            zephyrWorkspaceDirectory,
            "venv",
            process.platform === "win32" ? "Scripts" : "bin",
            process.platform === "win32" ? "python.exe" : "python"
          );
          if (existsSync(venvPython)) {
            _logger.info("Existing Python venv found.");
          } else {
            result = await _runCommand(createVenvCommandVenv, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            });
            if (result !== 0) {
              _logger.warn(
                "Could not create virtual environment with venv," +
                  "trying with virtualenv..."
              );

              result = await _runCommand(createVenvCommandVirtualenv, {
                cwd: zephyrWorkspaceDirectory,
                windowsHide: true,
                env: customEnv,
              });

              if (result === 0) {
                progress2.report({
                  message:
                    "Successfully setup Python virtual environment for Zephyr.",
                  increment: 100,
                });
              } else {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });
              }
            }

            _logger.info("Venv created.");
          }
        }
      );

      const venvPythonCommand: string = joinPosix(
        process.env.ComSpec === "powershell.exe" ? "&" : "",
        zephyrWorkspaceDirectory,
        "venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "python.exe" : "python"
      );

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Install Zephyr Python dependencies",
          cancellable: false,
        },
        async progress2 => {
          const installWestCommand: string = [
            venvPythonCommand,
            "-m pip install west pyelftools",
          ].join(" ");

          if (
            (await _runCommand(installWestCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            })) === 0
          ) {
            progress2.report({
              message: "Successfully installed Python dependencies for Zephyr.",
              increment: 100,
            });
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      const westExe: string = joinPosix(
        process.env.ComSpec === "powershell.exe" ? "&" : "",
        zephyrWorkspaceDirectory,
        "venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "west.exe" : "west"
      );

      await window.withProgress(
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
            _logger.info("West workspace already initialised.");
          } else {
            _logger.info("No West workspace found. Initialising...");

            const westInitCommand: string = [westExe, "init -l manifest"].join(
              " "
            );
            result = await _runCommand(westInitCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            });

            _logger.info(`${result}`);
          }

          const westUpdateCommand: string = [westExe, "update"].join(" ");

          if (
            (await _runCommand(westUpdateCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            })) === 0
          ) {
            progress2.report({
              message: "Successfully setup West workspace.",
              increment: 100,
            });
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      const zephyrExportCommand: string = [westExe, "zephyr-export"].join(" ");
      _logger.info("Exporting Zephyr CMake Files");
      result = await _runCommand(zephyrExportCommand, {
        cwd: zephyrWorkspaceDirectory,
        windowsHide: true,
        env: customEnv,
      });

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Install West Python dependencies",
          cancellable: false,
        },
        async progress2 => {
          const westPipPackagesCommand: string = [
            westExe,
            "packages pip --install",
          ].join(" ");

          if (
            (await _runCommand(westPipPackagesCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            })) === 0
          ) {
            progress2.report({
              message: "Successfully installed Python dependencies for West.",
              increment: 100,
            });
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Fetching Zephyr binary blobs",
          cancellable: false,
        },
        async progress2 => {
          const westBlobsFetchCommand: string = [
            westExe,
            "blobs fetch hal_infineon",
          ].join(" ");

          if (
            (await _runCommand(westBlobsFetchCommand, {
              cwd: zephyrWorkspaceDirectory,
              windowsHide: true,
              env: customEnv,
            })) === 0
          ) {
            progress2.report({
              message: "Successfully retrieved Zephyr binary blobs.",
              increment: 100,
            });
          } else {
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });
          }
        }
      );

      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Installing Zephyr SDK",
          cancellable: false,
        },
        async progress2 => {
          const westInstallSDKCommand: string = [
            westExe,
            "sdk install -t arm-zephyr-eabi",
            `-b ${zephyrWorkspaceDirectory}`,
          ].join(" ");

          // This has to be a spawn due to the way the underlying SDK command calls
          // subprocess and needs to inherit the Path variables set in customEnv
          _logger.info("Installing Zephyr SDK");
          const child = spawnSync(westInstallSDKCommand, {
            shell: true,
            cwd: zephyrWorkspaceDirectory,
            windowsHide: true,
            env: customEnv,
          });
          _logger.info("stdout: ", child.stdout.toString());
          _logger.info("stderr: ", child.stderr.toString());
          if (child.status) {
            _logger.info("exit code: ", child.status);
            if (child.status !== 0) {
              window.showErrorMessage(
                "Error installing Zephyr SDK." + "Exiting Zephyr Setup."
              );
            }

            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return;
          }

          progress2.report({
            message: "Successfully installed Zephyr SDK.",
            increment: 100,
          });
        }
      );

      if (installedSuccessfully) {
        window.showInformationMessage("Zephyr setup complete");
        progress.report({
          message: "Zephyr setup complete.",
          increment: 100,
        });
      }
    }
  );

  _logger.info("Complete");

  return output;
}
