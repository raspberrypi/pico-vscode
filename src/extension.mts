import { workspace, type ExtensionContext, type WorkspaceFolder } from "vscode";
import type { Command, CommandWithResult } from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import Logger from "./logger.mjs";
import { cmakeUpdateSuffix, configureCmakeNinja } from "./utils/cmakeUtil.mjs";
import Settings, { SettingsKey, type PackageJSON } from "./settings.mjs";
import UI from "./ui.mjs";
import { getSDKAndToolchainPath } from "./utils/picoSDKUtil.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import GetSDKPathCommand from "./commands/getSDKPath.mjs";
import GetToolchainPathCommand from "./commands/getToolchainPath.mjs";
import { setPicoSDKPath, setToolchainPath } from "./utils/picoSDKEnvUtil.mjs";
import { existsSync } from "fs";
import { basename, join } from "path";
import CompileProjectCommand from "./commands/compileProject.mjs";
import {
  generateNewEnvVarSuffix,
  setGlobalEnvVar,
} from "./utils/globalEnvironmentUtil.mjs";
import ClearEnvSuffixesCommand from "./commands/clearEnvSuffixes.mjs";
import LaunchTargetPathCommand from "./commands/launchTargetPath.mjs";
import { updateVSCodeStaticConfigs } from "./utils/vscodeConfigUtil.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  const settings = new Settings(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );

  const ui = new UI();
  ui.init();

  const COMMANDS: Array<Command | CommandWithResult<string>> = [
    new GetSDKPathCommand(settings),
    new GetToolchainPathCommand(settings),
    new NewProjectCommand(settings),
    new SwitchSDKCommand(settings, ui),
    new LaunchTargetPathCommand(),
    new CompileProjectCommand(),
    new ClearEnvSuffixesCommand(settings),
  ];

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  const workspaceFolder = workspace.workspaceFolders?.[0];

  // check if is a pico project
  if (
    workspaceFolder === undefined ||
    !existsSync(join(workspaceFolder.uri.fsPath, "pico_sdk_import.cmake"))
  ) {
    // finish activation
    return;
  }

  ui.showStatusBarItems();
  let envSuffix = settings.getString(SettingsKey.envSuffix);
  if (!envSuffix) {
    envSuffix = generateNewEnvVarSuffix();
    await settings.update(SettingsKey.envSuffix, envSuffix);
    cmakeUpdateSuffix(
      join(workspaceFolder.uri.fsPath, "CMakeLists.txt"),
      envSuffix
    );
  }

  // auto project configuration with cmake
  if (settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    await configureCmakeNinja(workspaceFolder.uri, settings, envSuffix);

    workspace.onDidChangeTextDocument(event => {
      // Check if the changed document is the file you are interested in
      if (basename(event.document.fileName) === "CMakeLists.txt") {
        // File has changed, do something here
        console.log("File changed:", event.document.fileName);
      }
    });
  } else {
    Logger.log(
      "No workspace folder for configuration found " +
        "or cmakeAutoConfigure disabled."
    );
  }

  await setupEnvironment(settings, ui, envSuffix, workspaceFolder);
}

async function setupEnvironment(
  settings: Settings,
  ui: UI,
  envSuffix: string,
  folder: WorkspaceFolder
): Promise<void> {
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
    setPicoSDKPath(sdkPath[0]);
    setToolchainPath(sdkPath[1]);
    if (envSuffix) {
      setGlobalEnvVar(`PICO_SDK_PATH_${envSuffix}`, sdkPath[0]);
      setGlobalEnvVar(`PICO_TOOLCHAIN_PATH_${envSuffix}`, sdkPath[1]);
    }

    await updateVSCodeStaticConfigs(
      join(folder.uri.fsPath, ".vscode"),
      sdkPath[1]
    );

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
      setPicoSDKPath(sdkPath[0]);
      setToolchainPath(sdkPath[1]);
      if (envSuffix) {
        setGlobalEnvVar(`PICO_SDK_PATH_${envSuffix}`, sdkPath[0]);
        setGlobalEnvVar(`PICO_TOOLCHAIN_PATH_${envSuffix}`, sdkPath[1]);
      }
      await updateVSCodeStaticConfigs(
        join(folder.uri.fsPath, ".vscode"),
        sdkPath[1]
      );
      ui.updateSDKVersion("custom");
    } else {
      // could not find SDK && toolchain
      ui.updateSDKVersion("N/A");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
