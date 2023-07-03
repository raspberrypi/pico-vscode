import { workspace, type ExtensionContext } from "vscode";
import type { Command, CommandWithResult } from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import HelloWorldCommand from "./commands/helloWorld.mjs";
import Logger from "./logger.mjs";
import { configureCmakeNinja } from "./utils/cmakeUtil.mjs";
import Settings, { SettingsKey, type PackageJSON } from "./settings.mjs";
import UI from "./ui.mjs";
import { getSDKAndToolchainPath } from "./utils/picoSDKUtil.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import GetSDKPathCommand from "./commands/getSDKPath.mjs";
import GetToolchainPathCommand from "./commands/getToolchainPath.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Congratulations the extension is now active!");

  const settings = new Settings(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );

  const ui = new UI();
  ui.init();

  const COMMANDS: Array<Command | CommandWithResult<string>> = [
    new HelloWorldCommand(),
    new GetSDKPathCommand(settings),
    new GetToolchainPathCommand(settings),
    new NewProjectCommand(settings),
    new SwitchSDKCommand(settings, ui),
  ];

  // TODO: somehow allow custom toolchain version in Windows installer so that the
  // user can also choose the version as the toolchainPath settings does normally
  // contain a machine specific path and is not suitable for repository

  // auto project configuration with cmake
  if (
    settings.getBoolean(SettingsKey.cmakeAutoConfigure) &&
    workspace.workspaceFolders &&
    workspace.workspaceFolders.length > 0
  ) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    await configureCmakeNinja(workspace.workspaceFolders?.[0].uri);
  } else {
    Logger.log("No workspace folder for configuration found");
  }

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  // check selected SDK version
  const sdkVersion = settings.getString(SettingsKey.picoSDK);

  if (sdkVersion) {
    ui.updateSDKVersion(sdkVersion);
  } else {
    // if still a path for sdk can be
    // retrieved (either by custom path settings or env), show "custom"
    if ((await getSDKAndToolchainPath(settings)) !== undefined) {
      ui.updateSDKVersion("custom");
    } else {
      ui.updateSDKVersion("N/A");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
