import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { commands, workspace } from "vscode";
import { DEBUG_LAYOUT } from "./cmdIds.mjs";

/**
 * Relay command for toggling the debug layout (debug activity bar and debug repl).
 */
export default class DebugLayoutCommand extends Command {
  private _logger: Logger = new Logger("DebugLayoutCommand");

  constructor() {
    super(DEBUG_LAYOUT);
  }

  async execute(): Promise<void> {
    await commands.executeCommand("workbench.view.debug");

    if (!(await workspace.getConfiguration().get("inDebugRepl"))) {
      await commands.executeCommand("workbench.debug.action.toggleRepl");
    }
  }
}
