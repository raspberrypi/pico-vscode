import { workspace, type ExtensionContext } from "vscode";
import type Command from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import HelloWorldCommand from "./commands/helloWorld.mjs";
import Logger from "./logger.mjs";
import { configureCmakeNinja } from "./utils/cmakeUtil.mjs";
import Settings, { type PackageJSON } from "./settings.mjs";

const COMMANDS: Command[] = [new HelloWorldCommand(), new NewProjectCommand()];

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Congratulations the extension is now active!");

  const settings = new Settings(
    context.workspaceState,
    context.extension.packageJSON as PackageJSON
  );

  // TODO: somehow allow custom toolchain version in Windows installer so that the
  // user can also choose the version as the toolchainPath settings does normally
  // contain a machine specific path and is not suitable for repository

  // auto project configuration with cmake
  // TODO: make disableable in the workspace and/or global settings
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    await configureCmakeNinja(workspace.workspaceFolders?.[0].uri);
  } else {
    Logger.log("No workspace folder for configuration found");
  }

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
