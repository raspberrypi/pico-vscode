import { commands, l10n, Uri, window, workspace } from "vscode";
import { CLEAN_ZEPHYR } from "./cmdIds.mjs";
import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { homedir } from "os";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import State from "../state.mjs";

export class CleanZephyrCommand extends Command {
  private _logger: Logger = new Logger("CleanZephyrCommand");

  public constructor() {
    super(CLEAN_ZEPHYR);
  }

  public override async execute(): Promise<void> {
    const zephyrWorkspaceUri = Uri.joinPath(
      Uri.file(homedir()),
      ".pico-sdk",
      "zephyr_workspace"
    );

    try {
      await workspace.fs.stat(zephyrWorkspaceUri);

      await workspace.fs.delete(zephyrWorkspaceUri, { recursive: true });
      this._logger.info(
        `Zephyr workspace at ${zephyrWorkspaceUri.fsPath} has been removed.`
      );
      if (State.getInstance().isZephyrProject) {
        const reloadWindow = l10n.t("Reload Window");
        const answer = await window.showInformationMessage(
          l10n.t(
            "Zephyr workspace has been removed. Reload the window to reinitialize the Zephyr workspace."
          ),
          reloadWindow
        );

        if (answer === reloadWindow) {
          await commands.executeCommand("workbench.action.reloadWindow");
        }
      } else {
        void window.showInformationMessage(
          l10n.t("Zephyr workspace has been removed.")
        );
      }
    } catch (e) {
      this._logger.warn(
        `Zephyr workspace at ${zephyrWorkspaceUri.fsPath} ` +
          `does not exist or could not be accessed: ${unknownErrorToString(e)}`
      );
      void window.showInformationMessage(
        l10n.t("A Zephyr workspace does not exist or could not be accessed.")
      );
    }
  }
}
