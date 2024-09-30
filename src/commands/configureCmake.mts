import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { window, workspace } from "vscode";
import { configureCmakeNinja } from "../utils/cmakeUtil.mjs";
import Settings, { SettingsKey } from "../settings.mjs";
import { join } from "path";
import { rimraf } from "rimraf";
import { unknownErrorToString } from "../utils/errorHelper.mjs";

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

    const settings = Settings.getInstance();

    if (
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      void window.showErrorMessage(
        "You must use the CMake Tools extension to configure your build. " +
          "To use this extension instead, change the useCmakeTools setting."
      );

      return;
    }

    if (await configureCmakeNinja(workspaceFolder.uri)) {
      void window.showInformationMessage("CMake has configured your build.");
    } else {
      void window.showWarningMessage("CMake has not configured your build.");
    }
  }
}

export class CleanCMakeCommand extends Command {
  private _logger: Logger = new Logger("CleanCMakeCommand");

  public static readonly id = "cleanCmake";

  constructor() {
    super(CleanCMakeCommand.id);
  }

  async execute(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];

    if (workspaceFolder === undefined) {
      this._logger.warn("No workspace folder found.");
      void window.showWarningMessage("No workspace folder found.");

      return;
    }

    const settings = Settings.getInstance();

    if (
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      void window.showErrorMessage(
        "You must use the CMake Tools extension to clean your build. " +
          "To use this extension instead, change the useCmakeTools setting."
      );

      return;
    }

    try {
      // delete build dir if present
      const buildDir = join(workspaceFolder.uri.fsPath, "build");
      await rimraf(buildDir, { maxRetries: 2 });
    } catch (error) {
      this._logger.error(
        "Error cleaning build directory.",
        unknownErrorToString(error)
      );
      void window.showErrorMessage("Error cleaning build directory.");

      return;
    }

    if (await configureCmakeNinja(workspaceFolder.uri)) {
      void window.showInformationMessage(
        "CMake has been cleaned and reconfigured."
      );
    } else {
      void window.showWarningMessage(
        "CMake could not be reconfigured. See log for details."
      );
    }
  }
}
