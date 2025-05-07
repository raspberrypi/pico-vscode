import { Command, extensionName } from "./command.mjs";
import Logger from "../logger.mjs";
import { commands, window, workspace, debug } from "vscode";
import State from "../state.mjs";
import DebugLayoutCommand from "./debugLayout.mjs";

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
    const isRustProject = State.getInstance().isRustProject;

    if (isRustProject) {
      const wsFolder = workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        this._logger.error("No workspace folder found.");
        void window.showErrorMessage("No workspace folder found.");

        return;
      }

      void commands.executeCommand(`${extensionName}.${DebugLayoutCommand.id}`);
      void debug.startDebugging(wsFolder, "Pico Debug (probe-rs)");

      return;
    }

    await commands.executeCommand("workbench.action.debug.selectandstart");
  }
}
