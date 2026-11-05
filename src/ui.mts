import { l10n, window, type StatusBarItem, StatusBarAlignment } from "vscode";
import Logger from "./logger.mjs";
import type { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import State from "./state.mjs";
import { extensionName } from "./commands/command.mjs";
import {
  COMPILE_PROJECT,
  RUN_PROJECT,
  SWITCH_BOARD,
  SWITCH_SDK,
} from "./commands/cmdIds.mjs";

enum StatusBarItemKey {
  compile = "raspberry-pi-pico.compileProject",
  run = "raspberry-pi-pico.runProject",
  picoSDKQuickPick = "raspberry-pi-pico.sdk-quick-pick",
  picoBoardQuickPick = "raspberry-pi-pico.board-quick-pick",
}

interface StatusBarItemDefinition {
  name: string;
  /** Status bar text, with value filled into the item's placeholder if any. */
  text: (value?: string) => string;
  rustText?: (value?: string) => string;
  zephyrText?: (value?: string) => string;
  command: string;
  tooltip: string;
  rustTooltip?: string;
  zephyrTooltip?: string;
  rustSupport: boolean;
  zephyrSupport: boolean;
}

// a function rather than a constant so l10n.t runs at use time, not import time
function getStatusBarItems(): {
  [key: string]: StatusBarItemDefinition;
} {
  return {
    [StatusBarItemKey.compile]: {
      name: l10n.t("Raspberry Pi Pico - Compile Project"),
      // alt. "$(gear) Compile"
      text: () =>
        "$(file-binary) " +
        l10n.t({ message: "Compile", comment: ["Status bar button"] }),
      command: `${extensionName}.${COMPILE_PROJECT}`,
      tooltip: l10n.t("Compile Project"),
      rustSupport: true,
      zephyrSupport: true,
    },
    [StatusBarItemKey.run]: {
      name: l10n.t("Raspberry Pi Pico - Run Project"),
      // alt. "$(gear) Compile"
      text: () =>
        "$(run) " + l10n.t({ message: "Run", comment: ["Status bar button"] }),
      command: `${extensionName}.${RUN_PROJECT}`,
      tooltip: l10n.t("Run Project"),
      rustSupport: true,
      zephyrSupport: true,
    },
    [StatusBarItemKey.picoSDKQuickPick]: {
      name: l10n.t("Raspberry Pi Pico - Select SDK Version"),
      text: (version = "<version>") => l10n.t("Pico SDK: {0}", version),
      zephyrText: (version = "<version>") =>
        l10n.t("Zephyr version: {0}", version),
      command: `${extensionName}.${SWITCH_SDK}`,
      tooltip: l10n.t("Select Pico SDK"),
      zephyrTooltip: l10n.t("Select system wide installed zephyr version"),
      rustSupport: false,
      zephyrSupport: true,
    },
    [StatusBarItemKey.picoBoardQuickPick]: {
      name: l10n.t("Raspberry Pi Pico - Select Board"),
      text: (board = "<board>") => l10n.t("Board: {0}", board),
      rustText: (chip = "<chip>") => l10n.t("Chip: {0}", chip),
      command: `${extensionName}.${SWITCH_BOARD}`,
      tooltip: l10n.t("Select board"),
      rustTooltip: l10n.t("Select Chip"),
      rustSupport: true,
      zephyrSupport: true,
    },
  };
}

export default class UI {
  private _logger: Logger;
  private _items: { [key: string]: StatusBarItem } = {};

  constructor(private readonly _activityBarProvider: PicoProjectActivityBar) {
    this._logger = new Logger("UI");
  }

  public init(): void {
    this._logger.info("Initializing UI");

    Object.entries(getStatusBarItems()).forEach(([key, value]) => {
      this._items[key] = this.createStatusBarItem(
        key,
        value.name,
        value.text(),
        value.command,
        value.tooltip
      );
    });
  }

  public showStatusBarItems(
    isRustProject = false,
    isZephyrProject = false
  ): void {
    const statusBarItems = getStatusBarItems();
    Object.values(this._items)
      .filter(item => !isRustProject || statusBarItems[item.id].rustSupport)
      .filter(item => !isZephyrProject || statusBarItems[item.id].zephyrSupport)
      .forEach(item => {
        if (isZephyrProject) {
          if (statusBarItems[item.id].zephyrText) {
            item.text = statusBarItems[item.id].zephyrText!();
          }
          if (statusBarItems[item.id].zephyrTooltip) {
            item.tooltip = statusBarItems[item.id].zephyrTooltip;
          }
        } else if (isRustProject) {
          if (statusBarItems[item.id].rustText) {
            item.text = statusBarItems[item.id].rustText!();
          }
          if (statusBarItems[item.id].rustTooltip) {
            item.tooltip = statusBarItems[item.id].rustTooltip;
          }
        }
        item.show();
      });
  }

  public updateSDKVersion(version: string): void {
    const isZephyrProject = State.getInstance().isZephyrProject;
    const item = getStatusBarItems()[StatusBarItemKey.picoSDKQuickPick];
    let template = item.text;

    if (isZephyrProject) {
      template = item.zephyrText!;
    }

    this._items[StatusBarItemKey.picoSDKQuickPick].text = template(version);
    this._activityBarProvider.refreshSDK(version);
  }

  public updateBoard(board: string): void {
    const isRustProject = State.getInstance().isRustProject;
    const item = getStatusBarItems()[StatusBarItemKey.picoBoardQuickPick];

    if (isRustProject && item.rustSupport) {
      this._items[StatusBarItemKey.picoBoardQuickPick].text =
        item.rustText!(board);
    } else {
      this._items[StatusBarItemKey.picoBoardQuickPick].text = item.text(board);
    }

    this._activityBarProvider.refreshBoard(board);
  }

  public updateBuildType(buildType: string): void {
    this._activityBarProvider.refreshBuildType(buildType);
  }

  /*
  /**
   * Returns the selected Pico SDK version from the status bar.
   *
   * @returns
  public getUIPicoSDKVersion(): string {
    /* unsafe, Needs to be updated if the status bar item format ever changes
    
    return this._items[StatusBarItemKey.picoSDKQuickPick].text
      .split(":")[1]
      .trim();
    return this._sdkVersion;
  }*/

  private createStatusBarItem(
    key: string,
    name: string,
    text: string,
    command: string,
    tooltip: string
  ): StatusBarItem {
    const item = window.createStatusBarItem(key, StatusBarAlignment.Right);
    item.name = name;
    item.text = text;
    item.command = command;
    item.tooltip = tooltip;

    return item;
  }
}
