import type Settings from "../settings.mjs";
import { getSDKAndToolchainPath } from "../utils/picoSDKUtil.mjs";
import { CommandWithResult } from "./command.mjs";

export default class GetToolchainPathCommand extends CommandWithResult<string> {
  private _settings: Settings;

  constructor(settings: Settings) {
    super("getToolchainPath");

    this._settings = settings;
  }

  async execute(): Promise<string> {
    const [, toolchainPath] =
      (await getSDKAndToolchainPath(this._settings)) ?? [];

    return toolchainPath ?? "";
  }
}
