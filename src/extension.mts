import {
  workspace,
  type ExtensionContext,
  window,
  type WebviewPanel,
} from "vscode";
import type { Command, CommandWithResult } from "./commands/command.mjs";
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

export async function activate(context: ExtensionContext): Promise<void> {
  /*if (process.platform === "win32") {
    queryInstalledSDKsFromUninstallers();
  }*/

  const settings = new Settings(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );

  const ui = new UI();
  ui.init();

  const COMMANDS: Array<Command | CommandWithResult<string>> = [
    new NewProjectCommand(settings, context.extensionUri),
    new SwitchSDKCommand(ui, settings),
    new LaunchTargetPathCommand(),
    new CompileProjectCommand(),
  ];

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  window.registerWebviewPanelSerializer(NewProjectPanel.viewType, {
    // eslint-disable-next-line @typescript-eslint/require-await
    async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
      // Reset the webview options so we use latest uri for `localResourceRoots`.
      webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
      NewProjectPanel.revive(webviewPanel, settings, context.extensionUri);
    },
  });

  const workspaceFolder = workspace.workspaceFolders?.[0];

  // check if is a pico project
  if (
    workspaceFolder === undefined ||
    !existsSync(join(workspaceFolder.uri.fsPath, "pico_sdk_import.cmake"))
  ) {
    // finish activation
    Logger.log("No workspace folder or pico project found.");

    return;
  }

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
      SDK_REPOSITORY_URL,
      settings
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
    await configureCmakeNinja(workspaceFolder.uri, settings);

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
export function deactivate(): void {}
