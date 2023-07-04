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
import { setPicoSDKPath, setToolchainPath } from "./utils/picoSDKEnvUtil.mjs";
import { existsSync } from "fs";
import { join } from "path";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Congratulations the extension is now active!");

  const settings = new Settings(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );

  const ui = new UI();
  ui.init();

  // WORKAROUND: this check is required because of this extension
  // beeing dependency of cpptools so it also gets activated in
  // many non pico projects and ui.show... in these other projects
  // would be confusing
  // TODO: maybe also check subdirectories
  if (
    workspace.workspaceFolders &&
    workspace.workspaceFolders.length > 0 &&
    existsSync(
      join(workspace.workspaceFolders?.[0].uri.fsPath, "pico_sdk_import.cmake")
    )
  ) {
    ui.showStatusBarItems();
  }

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
  // or thught a third party config/registry editor

  // auto project configuration with cmake
  if (
    settings.getBoolean(SettingsKey.cmakeAutoConfigure) &&
    workspace.workspaceFolders &&
    workspace.workspaceFolders.length > 0
  ) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    // TODO: maybe do this after env variables have been set so that the paths
    // are not queried twice
    await configureCmakeNinja(workspace.workspaceFolders?.[0].uri, settings);
  } else {
    Logger.log(
      "No workspace folder for configuration found " +
        "or cmakeAutoConfigure disabled."
    );
  }

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  // check selected SDK version
  const sdkVersion = settings.getString(SettingsKey.picoSDK);
  const sdkPath = await getSDKAndToolchainPath(settings);
  const customSDKPath =
    settings.getString(SettingsKey.picoSDKPath) || undefined;
  const customToolchainPath =
    settings.getString(SettingsKey.toolchainPath) || undefined;

  if (
    // a SDK version is selected
    sdkVersion &&
    sdkPath &&
    // only one path is custom
    (customSDKPath === undefined || customToolchainPath === undefined)
  ) {
    setPicoSDKPath(sdkPath[0], settings.getExtensionId());
    setToolchainPath(sdkPath[1]);
    ui.updateSDKVersion(
      sdkVersion +
        // if one custom path is set then the picoSDK is only partly replaced/modifed
        (customSDKPath !== undefined || customToolchainPath !== undefined
          ? " [MODIFIED]"
          : "")
    );
  } else {
    // both paths are custom, show "custom"
    if (sdkPath !== undefined) {
      setPicoSDKPath(sdkPath[0], settings.getExtensionId());
      setToolchainPath(sdkPath[1]);
      ui.updateSDKVersion("custom");
    } else {
      // could not find SDK && toolchain
      ui.updateSDKVersion("N/A");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
