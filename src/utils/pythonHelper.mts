import Settings, { HOME_VAR, SettingsKey } from "../settings.mjs";
import { PythonExtension } from "@vscode/python-extension";
import { downloadEmbedPython } from "./download.mjs";
import { pyenvInstallPython, setupPyenv } from "./pyenvUtil.mjs";
import { commands, ProgressLocation, window } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import { execSync } from "child_process";
import { unknownErrorToString } from "./errorHelper.mjs";
import type { Progress as GotProgress } from "got";
import { existsSync } from "fs";
import { homedir } from "os";
import { extensionName } from "../commands/command.mjs";

/**
 * This function tries to find a python environment to use. It will possible download
 * a python environment if it is not found and a download is available. This will
 * also be reflected automatically in the UI.
 *
 * Python is loaded in the following order:
 * 1. The python path set in the User (per machine) settings.
 * 2. Check python extension for any python environments with version >= 3.9
 * 3. Download python if OS = macOS or Windows.
 *
 * If a python environment is found, it will be set in the User (per machine) settings.
 *
 * @returns If this function returns undefined, it means that the user will have to set
 * the python path manually in the User (per machine) settings. If the python executable
 * path is returned, it can be in Uri.fsPath format e.g. with backslashes on Windows.
 */
export default async function findPython(): Promise<string | undefined> {
  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Searching for Python. " +
        "This may take a while if it has to be downloaded.",
      cancellable: false,
    },
    async progress => {
      // Check if python path is set in user settings
      let pythonPath = findPythonPathInUserSettings()?.replace(
        HOME_VAR,
        homedir()
      );
      if (pythonPath) {
        // check if it actually exists and is a supported version
        if (existsSync(pythonPath)) {
          try {
            const version = execSync(`${
              process.env.ComSpec === "powershell.exe" ? "&" : ""
            }"${pythonPath}" -V`, {
              encoding: "utf-8",
              timeout: 1000,
              windowsHide: true,
              maxBuffer: 1024,
            })
              .trim()
              .split(" ");
            if (version.length === 2 && checkPythonVersionRaw(version[1])) {
              return pythonPath;
            } else {
              Logger.warn(
                LoggerSource.pythonHelper,
                "Unable to check version of selected " +
                  "python path or it is not supported:",
                version
              );
              // TODO: clear python path from settings
            }
          } catch (error) {
            Logger.warn(
              LoggerSource.pythonHelper,
              "Unable to check version of selected python path:",
              unknownErrorToString(error)
            );
          }
        }
      }

      // Check python extension for any python environments with version >= 3.9
      pythonPath = await findPythonInPythonExtension();
      if (pythonPath) {
        await Settings.getInstance()?.updateGlobal(
          SettingsKey.python3Path,
          pythonPath
        );

        return pythonPath;
      }

      switch (process.platform) {
        case "darwin":
          await window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: "Downloading Python",
              cancellable: false,
            },
            // TODO: add progress and maybe cancelable
            async () => {
              if (await setupPyenv()) {
                pythonPath = (await pyenvInstallPython()) ?? undefined;
                if (pythonPath) {
                  await Settings.getInstance()?.updateGlobal(
                    SettingsKey.python3Path,
                    pythonPath
                  );

                  return pythonPath;
                }
              }
            }
          );
          break;
        case "win32":
          {
            if (process.arch !== "x64" && process.arch !== "arm64") {
              Logger.warn(
                LoggerSource.pythonHelper,
                "Unsupported architecture for Windows:",
                process.arch
              );
              void window.showErrorMessage(
                "Unsupported architecture for Windows: " + process.arch
              );

              return undefined;
            }
            let progressState = 0;
            pythonPath = await downloadEmbedPython(
              (prog: GotProgress): void => {
                const percent = prog.percent * 100;
                progress.report({ increment: percent - progressState });
                progressState = percent;
              }
            );
            if (pythonPath) {
              await Settings.getInstance()?.updateGlobal(
                SettingsKey.python3Path,
                pythonPath
              );

              return pythonPath;
            }
          }
          break;
      }

      return undefined;
    }
  );
}

function findPythonPathInUserSettings(): string | undefined {
  const settings = Settings.getInstance();

  return settings?.getString(SettingsKey.python3Path);
}

function checkPythonVersion(mayor: number, minor: number): boolean {
  if (mayor < 3 || minor < 9) {
    return false;
  }

  return true;
}

function checkPythonVersionRaw(version: string): boolean {
  const parts = version.split(".");
  const mayor = parseInt(parts[0]);
  const minor = parseInt(parts[1]);

  if (isNaN(mayor) || isNaN(minor)) {
    Logger.debug(
      LoggerSource.pythonHelper,
      "Python mayor or minor version is not a number:",
      version
    );

    return false;
  }

  return checkPythonVersion(mayor, minor);
}

async function findPythonInPythonExtension(): Promise<string | undefined> {
  const pyApi = await PythonExtension.api();
  await pyApi.environments.refreshEnvironments();
  await pyApi.ready;

  const activeEnv = pyApi.environments.getActiveEnvironmentPath();
  const resolved = await pyApi.environments.resolveEnvironment(activeEnv);
  if (
    resolved?.version &&
    checkPythonVersion(resolved.version.major, resolved.version.minor)
  ) {
    if (resolved.executable.uri) {
      return resolved.executable.uri.fsPath;
    } else {
      Logger.debug(
        LoggerSource.pythonHelper,
        "Python executable URI is not available for active environment."
      );
    }
  }

  // check other envs
  const envs = pyApi.environments.known;

  let limit = 15;
  for (const env of envs) {
    limit--;
    const resolved = await pyApi.environments.resolveEnvironment(env.path);
    if (
      resolved?.version &&
      checkPythonVersion(resolved.version.major, resolved.version.minor)
    ) {
      if (resolved.executable.uri) {
        return resolved.executable.uri.fsPath;
      } else {
        Logger.debug(
          LoggerSource.pythonHelper,
          "Python executable URI is not available for environment:",
          env.id
        );
      }
    }

    if (limit <= 0) {
      Logger.debug(
        LoggerSource.pythonHelper,
        "Reached limit of environments to check."
      );
      break;
    }
  }
}

export function showPythonNotFoundError(): void {
  void window
    .showErrorMessage(
      "Failed to find any valid Python installation. " +
        "Make sure Python >=3.9 is installed. " +
        "You can set a Python executable directly in your " +
        "user settings or select in the Python extension.",
      "Open Python Extension",
      "Edit Settings"
    )
    .then(selected => {
      if (selected === "Open Python Extension") {
        void commands.executeCommand("python.setInterpreter");
      } else if (selected === "Edit Settings") {
        void commands.executeCommand(
          "workbench.action.openSettings",
          extensionName + "." + SettingsKey.python3Path
        );
      }
    });
}
