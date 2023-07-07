import { workspace } from "vscode";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import {
  deleteGlobalEnvVars,
  generateNewEnvVarSuffix,
  setGlobalEnvVar,
} from "../utils/globalEnvironmentUtil.mjs";
import { Command } from "./command.mjs";
import { cmakeUpdateSuffix } from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { getSDKAndToolchainPath } from "../utils/picoSDKUtil.mjs";
import { setPicoSDKPath, setToolchainPath } from "../utils/picoSDKEnvUtil.mjs";

export default class ClearEnvSuffixesCommand extends Command {
  private _settings: Settings;

  constructor(settings: Settings) {
    super("clearEnvSuffixes");

    this._settings = settings;
  }

  async execute(): Promise<void> {
    deleteGlobalEnvVars("PICO_SDK_PATH_");
    deleteGlobalEnvVars("PICO_TOOLCHAIN_PATH_");

    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return;
    }

    const workspaceFolder = workspace.workspaceFolders[0];

    const newSuffix = generateNewEnvVarSuffix();
    await this._settings.update(SettingsKey.envSuffix, newSuffix);
    cmakeUpdateSuffix(
      join(workspaceFolder.uri.fsPath, "CMakeLists.txt"),
      newSuffix
    );

    const sdkPath = await getSDKAndToolchainPath(this._settings);

    if (sdkPath !== undefined) {
      setPicoSDKPath(sdkPath[0]);
      setToolchainPath(sdkPath[1]);
      setGlobalEnvVar(`PICO_SDK_PATH_${newSuffix}`, sdkPath[0]);
      setGlobalEnvVar(`PICO_TOOLCHAIN_PATH_${newSuffix}`, sdkPath[1]);
    }
  }
}
