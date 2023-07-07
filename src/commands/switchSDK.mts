import { compare } from "semver";
import { detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import { Command } from "./command.mjs";
import { window, workspace } from "vscode";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import type UI from "../ui.mjs";
import { join } from "path";
import { setPicoSDKPath, setToolchainPath } from "../utils/picoSDKEnvUtil.mjs";
import {
  generateNewEnvVarSuffix,
  setGlobalEnvVar,
} from "../utils/globalEnvironmentUtil.mjs";
import { cmakeUpdateSuffix } from "../utils/cmakeUtil.mjs";
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";

export default class SwitchSDKCommand extends Command {
  private _settings: Settings;
  private _ui: UI;

  constructor(settings: Settings, ui: UI) {
    super("switchSDK");

    this._settings = settings;
    this._ui = ui;
  }

  async execute(): Promise<void> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      void window.showErrorMessage("Please open a Pico project folder first.");

      return;
    }

    let envSuffix = this._settings.getString(SettingsKey.envSuffix);
    if (!envSuffix) {
      envSuffix = generateNewEnvVarSuffix();
      await this._settings.update(SettingsKey.envSuffix, envSuffix);
      cmakeUpdateSuffix(
        join(workspace.workspaceFolders[0].uri.fsPath, "CMakeLists.txt"),
        envSuffix
      );
    }

    const availableSDKs = detectInstalledSDKs()
      .sort((a, b) =>
        compare(a.version.replace("v", ""), b.version.replace("v", ""))
      )
      .map(sdk => ({
        label: `Pico SDK v${sdk.version}`,
        version: sdk.version,
        // TODO: maybe remove description
        description: `${sdk.sdkPath}; ${sdk.toolchainPath}`,
        sdkPath: sdk.sdkPath,
        toolchainPath: sdk.toolchainPath,
      }));

    const selectedSDK = await window.showQuickPick(availableSDKs, {
      placeHolder: "Select Pico SDK",
      canPickMany: false,
      ignoreFocusOut: false,
      title: "Switch Pico SDK",
    });

    if (!selectedSDK) {
      return;
    }

    setPicoSDKPath(selectedSDK.sdkPath);
    setToolchainPath(selectedSDK.toolchainPath);
    setGlobalEnvVar(`PICO_SDK_PATH_${envSuffix}`, selectedSDK.sdkPath);
    setGlobalEnvVar(
      `PICO_TOOLCHAIN_PATH_${envSuffix}`,
      selectedSDK.toolchainPath
    );
    void window.showWarningMessage(
      "Reload window to apply changes to linting."
    );
    // save selected SDK version to settings
    await this._settings.update(SettingsKey.picoSDK, selectedSDK.version);
    await updateVSCodeStaticConfigs(
      join(workspace.workspaceFolders[0].uri.fsPath, ".vscode"),
      selectedSDK.toolchainPath
    );
    this._ui.updateSDKVersion(selectedSDK.version);
  }
}
