import { window, type StatusBarItem, StatusBarAlignment } from "vscode";
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

const STATUS_BAR_ITEMS: {
  [key: string]: {
    name: string;
    text: string;
    rustText?: string;
    zephyrText?: string;
    command: string;
    tooltip: string;
    rustTooltip?: string;
    zephyrTooltip?: string;
    rustSupport: boolean;
    zephyrSupport: boolean;
  };
} = {
  [StatusBarItemKey.compile]: {
    name: "Raspberry Pi Pico - Compile Project",
    // alt. "$(gear) Compile"
    text: "$(file-binary) Compile",
    command: `${extensionName}.${COMPILE_PROJECT}`,
    tooltip: "Compile Project",
    rustSupport: true,
    zephyrSupport: true,
  },
  [StatusBarItemKey.run]: {
    name: "Raspberry Pi Pico - Run Project",
    // alt. "$(gear) Compile"
    text: "$(run) Run",
    command: `${extensionName}.${RUN_PROJECT}`,
    tooltip: "Run Project",
    rustSupport: true,
    zephyrSupport: true,
  },
  [StatusBarItemKey.picoSDKQuickPick]: {
    name: "Raspberry Pi Pico - Select SDK Version",
    text: "Pico SDK: <version>",
    zephyrText: "Zephyr version: <version>",
    command: `${extensionName}.${SWITCH_SDK}`,
    tooltip: "Select Pico SDK",
    zephyrTooltip: "Select system wide installed zephyr version",
    rustSupport: false,
    zephyrSupport: true,
  },
  [StatusBarItemKey.picoBoardQuickPick]: {
    name: "Raspberry Pi Pico - Select Board",
    text: "Board: <board>",
    rustText: "Chip: <chip>",
    command: `${extensionName}.${SWITCH_BOARD}`,
    tooltip: "Select board",
    rustTooltip: "Select Chip",
    rustSupport: true,
    zephyrSupport: true,
  },
};

export default class UI {
  private _logger: Logger;
  private _items: { [key: string]: StatusBarItem } = {};

  constructor(private readonly _activityBarProvider: PicoProjectActivityBar) {
    this._logger = new Logger("UI");
  }

  public init(): void {
    this._logger.info("Initializing UI");

    Object.entries(STATUS_BAR_ITEMS).forEach(([key, value]) => {
      this._items[key] = this.createStatusBarItem(
        key,
        value.name,
        value.text,
        value.command,
        value.tooltip
      );
    });
  }

  public showStatusBarItems(
    isRustProject = false,
    isZephyrProject = false
  ): void {
    Object.values(this._items)
      .filter(item => !isRustProject || STATUS_BAR_ITEMS[item.id].rustSupport)
      .filter(
        item => !isZephyrProject || STATUS_BAR_ITEMS[item.id].zephyrSupport
      )
      .forEach(item => {
        if (isZephyrProject) {
          if (STATUS_BAR_ITEMS[item.id].zephyrText) {
            item.text = STATUS_BAR_ITEMS[item.id].zephyrText!;
          }
          if (STATUS_BAR_ITEMS[item.id].zephyrTooltip) {
            item.tooltip = STATUS_BAR_ITEMS[item.id].zephyrTooltip;
          }
        } else if (isRustProject) {
          if (STATUS_BAR_ITEMS[item.id].rustText) {
            item.text = STATUS_BAR_ITEMS[item.id].rustText!;
          }
          if (STATUS_BAR_ITEMS[item.id].rustTooltip) {
            item.tooltip = STATUS_BAR_ITEMS[item.id].rustTooltip;
          }
        }
        item.show();
      });
  }

  public updateSDKVersion(version: string): void {
    const isZephyrProject = State.getInstance().isZephyrProject;
    let template = STATUS_BAR_ITEMS[StatusBarItemKey.picoSDKQuickPick].text;

    if (isZephyrProject) {
      template =
        STATUS_BAR_ITEMS[StatusBarItemKey.picoSDKQuickPick].zephyrText!;
    }

    this._items[StatusBarItemKey.picoSDKQuickPick].text = template.replace(
      "<version>",
      version
    );
    this._activityBarProvider.refreshSDK(version);
  }

  public updateBoard(board: string): void {
    const isRustProject = State.getInstance().isRustProject;

    if (
      isRustProject &&
      STATUS_BAR_ITEMS[StatusBarItemKey.picoBoardQuickPick].rustSupport
    ) {
      this._items[StatusBarItemKey.picoBoardQuickPick].text = STATUS_BAR_ITEMS[
        StatusBarItemKey.picoBoardQuickPick
      ].rustText!.replace("<chip>", board);
    } else {
      this._items[StatusBarItemKey.picoBoardQuickPick].text = STATUS_BAR_ITEMS[
        StatusBarItemKey.picoBoardQuickPick
      ].text.replace("<board>", board);
    }
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
