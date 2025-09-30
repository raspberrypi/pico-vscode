import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { window, commands } from "vscode";
import { rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import { OPENOCD_VERSION } from "../utils/sharedConstants.mjs";
import { UPDATE_OPENOCD } from "./cmdIds.mjs";

export default class UpdateOpenOCDCommand extends Command {
  private _logger: Logger = new Logger("UpdateOpenOCDCommand");

  constructor() {
    super(UPDATE_OPENOCD);
  }

  async execute(): Promise<void> {
    // uninstall OpenOCD then reload to install the latest version
    this._logger.info("Updating OpenOCD...");

    try {
      await rm(join(homedir(), ".pico-sdk/openocd", OPENOCD_VERSION), {
        recursive: true,
        force: true,
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
