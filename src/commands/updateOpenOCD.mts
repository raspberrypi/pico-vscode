import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { window, commands } from "vscode";
import { rimraf } from "rimraf";
import { join } from "path";
import { homedir } from "os";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import { openOCDVersion } from "../webview/newProjectPanel.mjs";

export default class UpdateOpenOCDCommand extends Command {
  private _logger: Logger = new Logger("UpdateOpenOCDCommand");

  public static readonly id = "updateOpenOCD";

  constructor() {
    super(UpdateOpenOCDCommand.id);
  }

  async execute(): Promise<void> {
    // uninstall OpenOCD then reload to install the latest version
    this._logger.info("Updating OpenOCD...");

    try {
      // rimraf ~/.pico-sdk/openocd/$openOCDVersion
      await rimraf(join(homedir(), ".pico-sdk/openocd", openOCDVersion), {
        preserveRoot: false,
        maxRetries: 1,
        retryDelay: 1000,
      });

      this._logger.info("OpenOCD uninstalled successfully - reloading window");
      void window.showInformationMessage(
        "OpenOCD uninstalled successfully - reloading window"
      );

      // reload window to install the latest version
      void commands.executeCommand("workbench.action.reloadWindow");
    } catch (error) {
      this._logger.error(
        "Failed to update OpenOCD",
        unknownErrorToString(error)
      );
      void window.showErrorMessage("Failed to update OpenOCD");

      return;
    }
  }
}
