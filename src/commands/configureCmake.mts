import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { window, workspace } from "vscode";
import { configureCmakeNinja } from "../utils/cmakeUtil.mjs";

export default class ConfigureCmakeCommand extends Command {
  private _logger: Logger = new Logger("ConfigureCmakeCommand");

  public static readonly id = "configureCmake";

  constructor() {
    super(ConfigureCmakeCommand.id);
  }

  async execute(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];

    // check if is a pico project
    if (workspaceFolder === undefined) {
      this._logger.warn("No workspace folder found.");
      void window.showWarningMessage("No workspace folder found.");

      return;
    }

    if (await configureCmakeNinja(workspaceFolder.uri)) {
      void window.showInformationMessage("CMake has configured your build.");
    } else {
      void window.showWarningMessage("CMake has not configured your build.");
    }
  }
}
