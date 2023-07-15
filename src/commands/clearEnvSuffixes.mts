import { window, workspace } from "vscode";
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
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";
import Logger from "../logger.mjs";

export default class ClearEnvSuffixesCommand extends Command {
  private _settings: Settings;
  private _logger: Logger = new Logger("ClearEnvSuffixesCommand");

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

    void window.showWarningMessage(
      "You may need to quit and restart VSCode for intellisense to work."
    );

    const sdkPath = await getSDKAndToolchainPath(this._settings);

    if (sdkPath !== undefined) {
      setPicoSDKPath(sdkPath[0]);
      setToolchainPath(sdkPath[1]);
      setGlobalEnvVar(`PICO_SDK_PATH_${newSuffix}`, sdkPath[0]);
      setGlobalEnvVar(`PICO_TOOLCHAIN_PATH_${newSuffix}`, sdkPath[1]);

      await updateVSCodeStaticConfigs(
        join(workspaceFolder.uri.fsPath, ".vscode"),
        newSuffix,
        sdkPath[1]
      );
    } else {
      this._logger.error(
        "Could not find SDK and Toolchain paths after reseting suffixes."
      );
    }
  }
}
