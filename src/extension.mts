import {
  workspace,
  type ExtensionContext,
  window,
  type WebviewPanel,
  commands,
  ProgressLocation,
} from "vscode";
import {
  extensionName,
  type Command,
  type CommandWithArgs,
  type CommandWithResult,
} from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import Logger, { LoggerSource } from "./logger.mjs";
import {
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX,
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD,
  cmakeGetPicoVar,
  cmakeGetSelectedBoard,
  cmakeGetSelectedToolchainAndSDKVersions,
  configureCmakeNinja,
} from "./utils/cmakeUtil.mjs";
import Settings, {
  SettingsKey,
  type PackageJSON,
  HOME_VAR,
} from "./settings.mjs";
import UI from "./ui.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import CompileProjectCommand from "./commands/compileProject.mjs";
import RunProjectCommand from "./commands/runProject.mjs";
import LaunchTargetPathCommand from "./commands/launchTargetPath.mjs";
import {
  GetPythonPathCommand,
  GetEnvPathCommand,
  GetGDBPathCommand,
  GetCompilerPathCommand,
  GetCxxCompilerPathCommand,
  GetChipCommand,
  GetTargetCommand,
  GetChipUppercaseCommand,
  GetPicotoolPathCommand,
} from "./commands/getPaths.mjs";
import {
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
  downloadAndInstallPicotool,
  downloadAndInstallOpenOCD,
} from "./utils/download.mjs";
import { SDK_REPOSITORY_URL } from "./utils/githubREST.mjs";
import { getSupportedToolchains } from "./utils/toolchainUtil.mjs";
import {
  NewProjectPanel,
  getWebviewOptions,
  openOCDVersion,
} from "./webview/newProjectPanel.mjs";
import GithubApiCache from "./utils/githubApiCache.mjs";
import ClearGithubApiCacheCommand from "./commands/clearGithubApiCache.mjs";
import { ContextKeys } from "./contextKeys.mjs";
import { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import ConditionalDebuggingCommand from "./commands/conditionalDebugging.mjs";
import DebugLayoutCommand from "./commands/debugLayout.mjs";
import OpenSdkDocumentationCommand from "./commands/openSdkDocumentation.mjs";
import ConfigureCmakeCommand, {
  CleanCMakeCommand,
  SwitchBuildTypeCommand,
} from "./commands/configureCmake.mjs";
import ImportProjectCommand from "./commands/importProject.mjs";
import { homedir } from "os";
import NewExampleProjectCommand from "./commands/newExampleProject.mjs";
import SwitchBoardCommand from "./commands/switchBoard.mjs";
import UninstallPicoSDKCommand from "./commands/uninstallPicoSDK.mjs";
import FlashProjectSWDCommand from "./commands/flashProjectSwd.mjs";
// eslint-disable-next-line max-len
import { NewMicroPythonProjectPanel } from "./webview/newMicroPythonProjectPanel.mjs";
import type { Progress as GotProgress } from "got";
import findPython, { showPythonNotFoundError } from "./utils/pythonHelper.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.info(LoggerSource.extension, "Extension activation triggered");

  const settings = Settings.createInstance(
    context.workspaceState,
    context.globalState,
    context.extension.packageJSON as PackageJSON
  );
  GithubApiCache.createInstance(context);

  const picoProjectActivityBarProvider = new PicoProjectActivityBar();
  const ui = new UI(picoProjectActivityBarProvider);
  ui.init();

  const COMMANDS: Array<
    | Command
    | CommandWithResult<string>
    | CommandWithResult<string | undefined>
    | CommandWithResult<boolean>
    | CommandWithArgs
  > = [
    new NewProjectCommand(context.extensionUri),
    new SwitchSDKCommand(ui, context.extensionUri),
    new SwitchBoardCommand(ui, context.extensionUri),
    new LaunchTargetPathCommand(),
    new GetPythonPathCommand(),
    new GetEnvPathCommand(),
    new GetGDBPathCommand(),
    new GetCompilerPathCommand(),
    new GetCxxCompilerPathCommand(),
    new GetChipCommand(),
    new GetChipUppercaseCommand(),
    new GetTargetCommand(),
    new GetPicotoolPathCommand(),
    new CompileProjectCommand(),
    new RunProjectCommand(),
    new FlashProjectSWDCommand(),
    new ClearGithubApiCacheCommand(),
    new ConditionalDebuggingCommand(),
    new DebugLayoutCommand(),
    new OpenSdkDocumentationCommand(context.extensionUri),
    new ConfigureCmakeCommand(),
    new SwitchBuildTypeCommand(ui),
    new ImportProjectCommand(context.extensionUri),
    new NewExampleProjectCommand(context.extensionUri),
    new UninstallPicoSDKCommand(),
    new CleanCMakeCommand(ui),
  ];

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(
        webviewPanel: WebviewPanel,
        state: { isImportProject: boolean; forceFromExample: boolean }
      ): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewProjectPanel.revive(
          webviewPanel,
          context.extensionUri,
          state && state.isImportProject,
          state && state.forceFromExample
        );
      },
    })
  );

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewMicroPythonProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewMicroPythonProjectPanel.revive(webviewPanel, context.extensionUri);
      },
    })
  );

  context.subscriptions.push(
    window.registerTreeDataProvider(
      PicoProjectActivityBar.viewType,
      picoProjectActivityBarProvider
    )
  );

  const workspaceFolder = workspace.workspaceFolders?.[0];

  // check if is a pico project
  if (
    workspaceFolder === undefined ||
    !existsSync(join(workspaceFolder.uri.fsPath, "pico_sdk_import.cmake"))
  ) {
    // finish activation
    Logger.warn(
      LoggerSource.extension,
      "No workspace folder or Pico project found."
    );
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );

    return;
  }

  const cmakeListsFilePath = join(workspaceFolder.uri.fsPath, "CMakeLists.txt");
  if (!existsSync(cmakeListsFilePath)) {
    Logger.warn(
      LoggerSource.extension,
      "No CMakeLists.txt in workspace folder has been found."
    );
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );

    return;
  }

  // check if it has .vscode folder and cmake donotedit header in CMakelists.txt
  if (
    !existsSync(join(workspaceFolder.uri.fsPath, ".vscode")) ||
    !(
      readFileSync(cmakeListsFilePath)
        .toString("utf-8")
        .includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX) ||
      readFileSync(cmakeListsFilePath)
        .toString("utf-8")
        .includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD)
    )
  ) {
    Logger.warn(
      LoggerSource.extension,
      "No .vscode folder and/or cmake",
      '"DO NOT EDIT"-header in CMakelists.txt found.'
    );
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );
    const wantToImport = await window.showInformationMessage(
      "Do you want to import this project as Raspberry Pi Pico project?",
      "Yes",
      "No"
    );
    if (wantToImport === "Yes") {
      void commands.executeCommand(
        `${extensionName}.${ImportProjectCommand.id}`,
        workspaceFolder.uri
      );
    }

    return;
  }

  await commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  // get sdk selected in the project
  const selectedToolchainAndSDKVersions =
    await cmakeGetSelectedToolchainAndSDKVersions(workspaceFolder.uri);
  if (selectedToolchainAndSDKVersions === null) {
    return;
  }

  // get all available toolchains for download link of current selected one
  const toolchains = await getSupportedToolchains();
  const selectedToolchain = toolchains.find(
    toolchain => toolchain.version === selectedToolchainAndSDKVersions[1]
  );

  // TODO: for failed installation message add option to change version
  let installSuccess = true;
  // install if needed
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing Pico SDK as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallSDK(
        selectedToolchainAndSDKVersions[0],
        SDK_REPOSITORY_URL
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}.`,
          "Make sure all requirements are met."
        );

        void window.showErrorMessage("Failed to install project SDK version.");

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  if (selectedToolchain === undefined) {
    Logger.error(
      LoggerSource.extension,
      "Failed to detect project toolchain version."
    );

    void window.showErrorMessage("Failed to detect project toolchain version.");

    return;
  }

  let progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing toolchain as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallToolchain(
        selectedToolchain,
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project toolchain",
          `version: ${selectedToolchainAndSDKVersions[1]}`
        );

        void window.showErrorMessage(
          "Failed to install project toolchain version."
        );

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project toolchain",
          `version: ${selectedToolchainAndSDKVersions[1]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing tools as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallTools(
        selectedToolchainAndSDKVersions[0],
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}.`,
          "Make sure all requirements are met."
        );

        void window.showErrorMessage("Failed to install project SDK version.");

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing picotool as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallPicotool(
        selectedToolchainAndSDKVersions[2],
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;
        Logger.error(LoggerSource.extension, "Failed to install picotool.");

        void window.showErrorMessage("Failed to install picotool.");

        return;
      } else {
        Logger.debug(LoggerSource.extension, "Found/installed picotool.");
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing OpenOCD. This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallOpenOCD(
        openOCDVersion,
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        Logger.error(
          LoggerSource.extension,
          "Failed to download and install OpenOCD."
        );
        void window.showWarningMessage(
          "Failed to download and install OpenOCD."
        );
      } else {
        Logger.debug(LoggerSource.extension, "Found/installed OpenOCD.");

        void window.showInformationMessage(
          "OpenOCD found/installed successfully."
        );
      }
    }
  );

  // TODO: move this ninja, cmake and python installs out of extension.mts
  const ninjaPath = settings.getString(SettingsKey.ninjaPath);
  if (ninjaPath && ninjaPath.includes("/.pico-sdk/ninja")) {
    // check if ninja path exists
    if (!existsSync(ensureExe(ninjaPath.replace(HOME_VAR, homedir())))) {
      Logger.debug(
        LoggerSource.extension,
        "Ninja path in settings does not exist.",
        "Installing ninja to default path."
      );
      const ninjaVersion = /\/\.pico-sdk\/ninja\/([v.0-9]+)\//.exec(
        ninjaPath
      )?.[1];
      if (ninjaVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get ninja version from path in the settings."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      progressState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Ninja. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallNinja(
            ninjaVersion,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.error(LoggerSource.extension, "Failed to install ninja.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.debug(
        LoggerSource.extension,
        "Installed selected ninja for project."
      );
    }
  }

  const cmakePath = settings.getString(SettingsKey.cmakePath);
  if (cmakePath && cmakePath.includes("/.pico-sdk/cmake")) {
    // check if cmake path exists
    if (!existsSync(ensureExe(cmakePath.replace(HOME_VAR, homedir())))) {
      Logger.warn(
        LoggerSource.extension,
        "CMake path in settings does not exist.",
        "Installing CMake to default path."
      );

      const cmakeVersion = /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//.exec(
        cmakePath
      )?.[1];
      if (cmakeVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get CMake version from path in the settings."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      progressState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing CMake. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallCmake(
            cmakeVersion,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.error(LoggerSource.extension, "Failed to install CMake.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.debug(
        LoggerSource.extension,
        "Installed selected cmake for project."
      );
    }
  }

  const pythonPath = await findPython();
  if (!pythonPath) {
    Logger.error(LoggerSource.extension, "Failed to find Python3 executable.");
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );
    showPythonNotFoundError();

    return;
  }

  /*
  const pythonPath = settings.getString(SettingsKey.python3Path);
  if (pythonPath && pythonPath.includes("/.pico-sdk/python")) {
    // check if python path exists
    if (!existsSync(pythonPath.replace(HOME_VAR, homedir()))) {
      Logger.warn(
        LoggerSource.extension,
        "Python path in settings does not exist.",
        "Installing Python3 to default path."
      );
      const pythonVersion = /\/\.pico-sdk\/python\/([.0-9]+)\//.exec(
        pythonPath
      )?.[1];
      if (pythonVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get Python version from path."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result: string | undefined;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title:
            "Downloading and installing Python. This may take a long while...",
          cancellable: false,
        },
        async progress => {
          if (process.platform === "win32") {
            const versionBundle = await new VersionBundlesLoader(
              context.extensionUri
            ).getPythonWindowsAmd64Url(pythonVersion);

            if (versionBundle === undefined) {
              Logger.error(
                LoggerSource.extension,
                "Failed to get Python download url from version bundle."
              );
              await commands.executeCommand(
                "setContext",
                ContextKeys.isPicoProject,
                false
              );

              return;
            }

            // ! because data.pythonMode === 0 => versionBundle !== undefined
            result = await downloadEmbedPython(versionBundle);
          } else if (process.platform === "darwin") {
            const result1 = await setupPyenv();
            if (!result1) {
              progress.report({
                increment: 100,
              });

              return;
            }
            const result2 = await pyenvInstallPython(pythonVersion);

            if (result2 !== null) {
              result = result2;
            }
          } else {
            Logger.info(
              LoggerSource.extension,
              "Automatic Python installation is only",
              "supported on Windows and macOS."
            );

            await window.showErrorMessage(
              "Automatic Python installation is only " +
                "supported on Windows and macOS."
            );
          }
          progress.report({
            increment: 100,
          });
        }
      );

      if (result === undefined) {
        Logger.error(LoggerSource.extension, "Failed to install Python3.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
    }
  }*/

  ui.showStatusBarItems();
  ui.updateSDKVersion(selectedToolchainAndSDKVersions[0]);

  const selectedBoard = cmakeGetSelectedBoard(workspaceFolder.uri);
  if (selectedBoard !== null) {
    ui.updateBoard(selectedBoard);
  } else {
    ui.updateBoard("unknown");
  }

  // auto project configuration with cmake
  if (settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    await configureCmakeNinja(workspaceFolder.uri);

    const ws = workspaceFolder.uri.fsPath;
    const cMakeCachePath = join(ws, "build","CMakeCache.txt");
    const newBuildType = cmakeGetPicoVar(cMakeCachePath, "CMAKE_BUILD_TYPE");
    ui.updateBuildType(newBuildType ?? "unknown");

    workspace.onDidChangeTextDocument(event => {
      // Check if the changed document is the file you are interested in
      if (basename(event.document.fileName) === "CMakeLists.txt") {
        // File has changed, do something here
        // TODO: rerun configure project
        // TODO: maybe conflicts with cmake extension which also does this
        Logger.debug(
          LoggerSource.extension,
          "File changed:",
          event.document.fileName
        );
      }
    });
  } else {
    Logger.info(
      LoggerSource.extension,
      "No workspace folder for configuration found",
      "or cmakeAutoConfigure disabled."
    );
  }
}

/**
 * Make sure the executable has the .exe extension on Windows.
 *
 * @param inp - The input string.
 * @returns The input string with .exe extension if on Windows.
 */
function ensureExe(inp: string): string {
  return process.platform === "win32"
    ? inp.endsWith(".exe")
      ? inp
      : `${inp}.exe`
    : inp;
}

export function deactivate(): void {
  // TODO: maybe await
  void commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  Logger.info(LoggerSource.extension, "Extension deactivated.");
}
