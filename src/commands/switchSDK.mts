import { compare } from "semver";
import { type PicoSDK, detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import { Command } from "./command.mjs";
import { window } from "vscode";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import type UI from "../ui.mjs";

export default class SwitchSDKCommand extends Command {
  private _settigs: Settings;
  private _ui: UI;

  constructor(settings: Settings, ui: UI) {
    super("switchSDK");

    this._settigs = settings;
    this._ui = ui;
  }

  async execute(): Promise<void> {
    const availableSDKs = (await detectInstalledSDKs()).sort((a, b) =>
      compare(a.version, b.version)
    );

    const selectedSDK = await window.showQuickPick<PicoSDK>(availableSDKs, {
      placeHolder: "Select Pico SDK",
      canPickMany: false,
      ignoreFocusOut: false,
      title: "Switch Pico SDK",
    });

    if (!selectedSDK) {
      return;
    }

    // TODO: maybe ensure workspace settings are used
    // save selected SDK version to settings
    await this._settigs.update(SettingsKey.picoSDK, selectedSDK.version);
    this._ui.updateSDKVersion(selectedSDK.version);
  }
}
