import {
  workspace,
  type ExtensionContext,
  window,
  type WebviewPanel,
  commands,
} from "vscode";
import type {
  Command,
  CommandWithArgs,
  CommandWithResult,
} from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import Logger from "./logger.mjs";
import {
  cmakeGetSelectedToolchainAndSDKVersions,
  configureCmakeNinja,
} from "./utils/cmakeUtil.mjs";
import Settings, { SettingsKey, type PackageJSON } from "./settings.mjs";
import UI from "./ui.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import { existsSync } from "fs";
import { basename, join } from "path";
import CompileProjectCommand from "./commands/compileProject.mjs";
import LaunchTargetPathCommand from "./commands/launchTargetPath.mjs";
import {
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
} from "./utils/download.mjs";
import { SDK_REPOSITORY_URL } from "./utils/githubREST.mjs";
import { getSupportedToolchains } from "./utils/toolchainUtil.mjs";
import {
  NewProjectPanel,
  getWebviewOptions,
} from "./webview/newProjectPanel.mjs";
import GithubApiCache from "./utils/githubApiCache.mjs";
import ClearGithubApiCacheCommand from "./commands/clearGithubApiCache.mjs";
import { ContextKeys } from "./contextKeys.mjs";
import { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import ConditionalDebuggingCommand from "./commands/conditionalDebugging.mjs";
import DebugLayoutCommand from "./commands/debugLayout.mjs";
import OpenSdkDocumentationCommand from "./commands/openSdkDocumentation.mjs";
import ConfigureCmakeCommand from "./commands/configureCmake.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Extension activated.");

  const settings = Settings.createInstance(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );
  GithubApiCache.createInstance(context);

  const picoProjectActivityBarProvider = new PicoProjectActivityBar();
  const ui = new UI(picoProjectActivityBarProvider);
  ui.init();

  const COMMANDS: Array<Command | CommandWithResult<string> | CommandWithArgs> =
    [
      new NewProjectCommand(context.extensionUri),
      new SwitchSDKCommand(ui, context.extensionUri),
      new LaunchTargetPathCommand(),
      new CompileProjectCommand(),
      new ClearGithubApiCacheCommand(),
      new ConditionalDebuggingCommand(),
      new DebugLayoutCommand(),
      new OpenSdkDocumentationCommand(context.extensionUri),
      new ConfigureCmakeCommand(),
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
        NewProjectPanel.revive(webviewPanel, context.extensionUri);
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
  await commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  // get sdk selected in the project
  const selectedToolchainAndSDKVersions =
    cmakeGetSelectedToolchainAndSDKVersions(
      join(workspaceFolder.uri.fsPath, "CMakeLists.txt")
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
    !(await downloadAndInstallTools(
      selectedToolchainAndSDKVersions[0],
      process.platform === "win32"
    ))
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

  ui.showStatusBarItems();
  ui.updateSDKVersion(selectedToolchainAndSDKVersions[0]);

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

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {
  void commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  Logger.log("Extension deactivated.");
}
