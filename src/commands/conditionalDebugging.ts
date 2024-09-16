import { Command } from "./command";
import Logger from "../logger";
import { commands } from "vscode";

/**
 * Relay command for the default buildin debug select and start command.
 * Used for conditional enablement in ui.
 */
export default class ConditionalDebuggingCommand extends Command {
  private _logger: Logger = new Logger("ConditionalDebuggingCommand");

  public static readonly id = "conditionalDebugging";

  constructor() {
    super(ConditionalDebuggingCommand.id);
  }

  async execute(): Promise<void> {
    await commands.executeCommand("workbench.action.debug.selectandstart");
  }
}
