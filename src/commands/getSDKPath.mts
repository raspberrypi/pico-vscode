import type Settings from "../settings.mjs";
import { getSDKAndToolchainPath } from "../utils/picoSDKUtil.mjs";
import { CommandWithResult } from "./command.mjs";

export default class GetSDKPathCommand extends CommandWithResult<string> {
  private _settings: Settings;

  constructor(settings: Settings) {
    super("getSDKPath");

    this._settings = settings;
  }

  async execute(): Promise<string> {
    const [sdkPath] = (await getSDKAndToolchainPath(this._settings)) ?? [];

    return sdkPath ?? "";
  }
}
