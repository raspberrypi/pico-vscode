import { compare } from "semver";
import { detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import { Command } from "./command.mjs";
import { window, workspace } from "vscode";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import type UI from "../ui.mjs";
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";
import { join } from "path";
import { setPicoSDKPath, setToolchainPath } from "../utils/picoSDKEnvUtil.mjs";

export default class SwitchSDKCommand extends Command {
  private _settings: Settings;
  private _ui: UI;

  constructor(settings: Settings, ui: UI) {
    super("switchSDK");

    this._settings = settings;
    this._ui = ui;
  }

  async execute(): Promise<void> {
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

    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      await updateVSCodeStaticConfigs(
        join(workspace.workspaceFolders?.[0].uri.fsPath, ".vscode"),
        selectedSDK.sdkPath,
        selectedSDK.toolchainPath
      );
    }

    setPicoSDKPath(selectedSDK.sdkPath);
    setToolchainPath(selectedSDK.toolchainPath);
    void window.showWarningMessage(
      "Reload window to apply changes to linting."
    );
    // save selected SDK version to settings
    await this._settings.update(SettingsKey.picoSDK, selectedSDK.label);
    this._ui.updateSDKVersion(selectedSDK.version);
  }
}
