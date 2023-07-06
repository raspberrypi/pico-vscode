import type Settings from "../settings.mjs";
import { removeCppToolsDependency } from "../utils/picoSDKEnvUtil.mjs";
import { Command } from "./command.mjs";

export default class ResetCmakeToolsCommand extends Command {
  private _settings: Settings;

  constructor(settings: Settings) {
    super("resetCmakeTools");

    this._settings = settings;
  }

  execute(): void {
    removeCppToolsDependency(this._settings.getExtensionId());

    return;
  }
}
