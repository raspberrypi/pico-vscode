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
      await window.showWarningMessage("No workspace folder found.");

      return;
    }

    await configureCmakeNinja(workspaceFolder.uri);
    await window.showInformationMessage("CMake has configured your build.");
  }
}
