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
import Logger from "./logger.mjs";
import {
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
  GetChipCommand,
  GetTargetCommand,
  GetChipUppercaseCommand,
} from "./commands/getPaths.mjs";
import {
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
  downloadAndInstallPicotool,
  downloadAndInstallOpenOCD,
  downloadEmbedPython,
} from "./utils/download.mjs";
import { SDK_REPOSITORY_URL } from "./utils/githubREST.mjs";
import { getSupportedToolchains } from "./utils/toolchainUtil.mjs";
import {
  NewProjectPanel,
  getWebviewOptions,
  picotoolVersion,
  openOCDVersion,
} from "./webview/newProjectPanel.mjs";
import GithubApiCache from "./utils/githubApiCache.mjs";
import ClearGithubApiCacheCommand from "./commands/clearGithubApiCache.mjs";
import { ContextKeys } from "./contextKeys.mjs";
import { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import ConditionalDebuggingCommand from "./commands/conditionalDebugging.mjs";
import DebugLayoutCommand from "./commands/debugLayout.mjs";
import OpenSdkDocumentationCommand from "./commands/openSdkDocumentation.mjs";
import ConfigureCmakeCommand from "./commands/configureCmake.mjs";
import ImportProjectCommand from "./commands/importProject.mjs";
import { homedir } from "os";
import VersionBundlesLoader from "./utils/versionBundles.mjs";
import { pyenvInstallPython, setupPyenv } from "./utils/pyenvUtil.mjs";
import NewExampleProjectCommand from "./commands/newExampleProject.mjs";
import SwitchBoardCommand from "./commands/switchBoard.mjs";

export const CMAKE_DO_NOT_EDIT_HEADER_PREFIX =
  // eslint-disable-next-line max-len
  "== DO NEVER EDIT THE NEXT LINES for Raspberry Pi Pico VS Code Extension to work ==";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Extension activated.");

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
    | CommandWithResult<boolean>
    | CommandWithArgs
  > = [
    new NewProjectCommand(context.extensionUri),
    new SwitchSDKCommand(ui, context.extensionUri),
    new SwitchBoardCommand(ui),
    new LaunchTargetPathCommand(),
    new GetPythonPathCommand(),
    new GetEnvPathCommand(),
    new GetGDBPathCommand(),
    new GetChipCommand(),
    new GetChipUppercaseCommand(),
    new GetTargetCommand(),
    new CompileProjectCommand(),
    new RunProjectCommand(),
    new ClearGithubApiCacheCommand(),
    new ConditionalDebuggingCommand(),
    new DebugLayoutCommand(),
    new OpenSdkDocumentationCommand(context.extensionUri),
    new ConfigureCmakeCommand(),
    new ImportProjectCommand(context.extensionUri),
    new NewExampleProjectCommand(context.extensionUri),
  ];

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewProjectPanel.revive(webviewPanel, context.extensionUri, false);
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
    Logger.log("No workspace folder or pico project found.");
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );

    return;
  }

  const cmakeListsFilePath = join(workspaceFolder.uri.fsPath, "CMakeLists.txt");
  if (!existsSync(cmakeListsFilePath)) {
    Logger.log("No CMakeLists.txt found in workspace folder.");
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
    !readFileSync(cmakeListsFilePath)
      .toString("utf-8")
      .includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX)
  ) {
    Logger.log(
      "No .vscode folder and/or cmake " +
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
    await cmakeGetSelectedToolchainAndSDKVersions(
      workspaceFolder.uri
    );
  if (selectedToolchainAndSDKVersions === null) {
    return;
  }

  // get all available toolchains for download link of current selected one
  const toolchains = await getSupportedToolchains();
  const selectedToolchain = toolchains.find(
    toolchain => toolchain.version === selectedToolchainAndSDKVersions[1]
  );

  // install if needed
  if (
    !(await downloadAndInstallSDK(
      selectedToolchainAndSDKVersions[0],
      SDK_REPOSITORY_URL
    )) ||
    !(await downloadAndInstallTools(selectedToolchainAndSDKVersions[0])) ||
    !(await downloadAndInstallPicotool(picotoolVersion))
  ) {
    Logger.log(
      "Failed to install project SDK " +
        `version: ${selectedToolchainAndSDKVersions[0]}.` +
        "Make sure all requirements are met."
    );

    void window.showErrorMessage("Failed to install project SDK version.");

    return;
  } else {
    Logger.log(
      "Found/installed project SDK " +
        `version: ${selectedToolchainAndSDKVersions[0]}`
    );

    if (!(await downloadAndInstallOpenOCD(openOCDVersion))) {
      Logger.log("Failed to download and install openocd.");
    } else {
      Logger.log("Successfully downloaded and installed openocd.");
    }
  }

  // install if needed
  if (
    selectedToolchain === undefined ||
    !(await downloadAndInstallToolchain(selectedToolchain))
  ) {
    Logger.log(
      "Failed to install project toolchain " +
        `version: ${selectedToolchainAndSDKVersions[1]}`
    );

    void window.showErrorMessage(
      "Failed to install project toolchain version."
    );

    return;
  } else {
    Logger.log(
      "Found/installed project toolchain " +
        `version: ${selectedToolchainAndSDKVersions[1]}`
    );
  }

  // TODO: move this ninja, cmake and python installs auto of extension.mts
  const ninjaPath = settings.getString(SettingsKey.ninjaPath);
  if (ninjaPath && ninjaPath.includes("/.pico-sdk/ninja")) {
    // check if ninja path exists
    if (!existsSync(ninjaPath.replace(HOME_VAR, homedir()))) {
      Logger.log(
        "Ninja path in settings does not exist. " +
          "Installing ninja to default path."
      );
      const ninjaVersion = /\/\.pico-sdk\/ninja\/([v.0-9]+)\//.exec(
        ninjaPath
      )?.[1];
      if (ninjaVersion === undefined) {
        Logger.log("Failed to get ninja version from path.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Download and installing Ninja. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallNinja(ninjaVersion);
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.log("Failed to install ninja.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.log("Installed selected ninja for project.");
    }
  }

  const cmakePath = settings.getString(SettingsKey.cmakePath);
  if (cmakePath && cmakePath.includes("/.pico-sdk/cmake")) {
    // check if cmake path exists
    if (!existsSync(cmakePath.replace(HOME_VAR, homedir()))) {
      Logger.log(
        "CMake path in settings does not exist. " +
          "Installing cmake to default path."
      );

      const cmakeVersion = /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//.exec(
        cmakePath
      )?.[1];
      if (cmakeVersion === undefined) {
        Logger.log("Failed to get cmake version from path.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Download and installing CMake. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallCmake(cmakeVersion);
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.log("Failed to install cmake.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.log("Installed selected cmake for project.");
    }
  }

  const pythonPath = settings.getString(SettingsKey.python3Path);
  if (pythonPath && pythonPath.includes("/.pico-sdk/python")) {
    // check if python path exists
    if (!existsSync(pythonPath.replace(HOME_VAR, homedir()))) {
      Logger.log(
        "Python path in settings does not exist. " +
          "Installing python to default path."
      );
      const pythonVersion = /\/\.pico-sdk\/python\/([.0-9]+)\//.exec(
        pythonPath
      )?.[1];
      if (pythonVersion === undefined) {
        Logger.log("Failed to get python version from path.");
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
            "Download and installing Python. This may take a long while...",
          cancellable: false,
        },
        async progress => {
          if (process.platform === "win32") {
            const versionBundle = await new VersionBundlesLoader(
              context.extensionUri
            ).getPythonWindowsAmd64Url(pythonVersion);

            if (versionBundle === undefined) {
              Logger.log("Failed to get python url from version bundle.");
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
            Logger.log(
              "Automatic Python installation is only " +
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
        Logger.log("Failed to install python.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
    }
  }

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

    workspace.onDidChangeTextDocument(event => {
      // Check if the changed document is the file you are interested in
      if (basename(event.document.fileName) === "CMakeLists.txt") {
        // File has changed, do something here
        // TODO: rerun configure project
        // TODO: maybe conflicts with cmake extension which also does this
        console.log("File changed:", event.document.fileName);
      }
    });
  } else {
    Logger.log(
      "No workspace folder for configuration found " +
        "or cmakeAutoConfigure disabled."
    );
  }
}

export function deactivate(): void {
  void commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  Logger.log("Extension deactivated.");
}
