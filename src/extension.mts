import { workspace, type ExtensionContext } from "vscode";
import type Command from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import HelloWorldCommand from "./commands/helloWorld.mjs";
import Logger from "./logger.mjs";
import { configureCmakeForNinja } from "./utils/cmakeUtil.mjs";

const COMMANDS: Command[] = [new HelloWorldCommand(), new NewProjectCommand()];

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Congratulations the extension is now active!");

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    //run `cmake -G Ninja -B ./build ` in the root folder
    await configureCmakeForNinja(workspace.workspaceFolders?.[0].uri);
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
