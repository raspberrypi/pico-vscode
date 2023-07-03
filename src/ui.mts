import { window, type StatusBarItem, StatusBarAlignment } from "vscode";
import Logger from "./logger.mjs";

enum StatusBarItemKey {
  picoSDKQuickPick = "raspberry-pi-pico.sdk-quick-pick",
}

const STATUS_BAR_ITEMS: {
  [key: string]: { text: string; command: string; tooltip: string };
} = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  [StatusBarItemKey.picoSDKQuickPick]: {
    text: "Pico SDK: <version>",
    command: "raspberry-pi-pico.switchSDK",
    tooltip: "Select Pico SDK",
  },
};

export default class UI {
  private _logger: Logger;
  private _items: { [key: string]: StatusBarItem } = {};

  constructor() {
    this._logger = new Logger("UI");
  }

  public init(): void {
    this._logger.info("Initializing UI");

    Object.entries(STATUS_BAR_ITEMS).forEach(([key, value]) => {
      this._items[key] = this.createStatusBarItem(
        key,
        value.text,
        value.command,
        value.tooltip
      );
    });
  }

  public updateSDKVersion(version: string): void {
    this._items[StatusBarItemKey.picoSDKQuickPick].text = STATUS_BAR_ITEMS[
      StatusBarItemKey.picoSDKQuickPick
    ].text.replace("<version>", version);
  }

  private createStatusBarItem(
    key: string,
    text: string,
    command: string,
    tooltip: string
  ): StatusBarItem {
    const item = window.createStatusBarItem(key, StatusBarAlignment.Right);
    item.text = text;
    item.command = command;
    item.tooltip = tooltip;

    return item;
  }
}
