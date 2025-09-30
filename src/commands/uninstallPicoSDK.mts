import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { window } from "vscode";
import { rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import { UNINSTALL_PICO_SDK } from "./cmdIds.mjs";

export default class UninstallPicoSDKCommand extends Command {
  private _logger: Logger = new Logger("UninstallPicoSDKCommand");

  constructor() {
    super(UNINSTALL_PICO_SDK);
  }

  async execute(): Promise<void> {
    // show modal warning that this will delete the Pico SDK and
    // all its automatically installed dependencies from the system
    // and ask for confirmation

    const response = await window.showWarningMessage(
      "Uninstalling Pico SDK - Are you sure you want to continue?",
      {
        modal: true,
        detail:
          "This will delete the Pico SDK and all its automatically installed " +
          "dependencies from the system. This action cannot be undone.",
      },
      "Yes",
      "No"
    );

    if (response === "Yes") {
      // uninstall the Pico SDK and all its automatically installed dependencies
      this._logger.info("Uninstalling Pico SDK...");

      try {
        await rm(join(homedir(), ".pico-sdk"), {
          recursive: true,
          force: true,
          maxRetries: 1,
          retryDelay: 1000,
        });

        this._logger.info("Pico SDK uninstalled successfully");
        void window.showInformationMessage("Pico SDK uninstalled successfully");
      } catch (error) {
        this._logger.error(
          "Failed to uninstall Pico SDK",
          unknownErrorToString(error)
        );
        void window.showErrorMessage("Failed to uninstall Pico SDK");

        return;
      }
    } else {
      this._logger.debug("Pico SDK uninstallation cancelled");
    }
  }
}
