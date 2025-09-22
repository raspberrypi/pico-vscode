import { window, type StatusBarItem, StatusBarAlignment } from "vscode";
import Logger from "./logger.mjs";
import type { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import State from "./state.mjs";
import { extensionName } from "./commands/command.mjs";
import CompileProjectCommand from "./commands/compileProject.mjs";
import RunProjectCommand from "./commands/runProject.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import SwitchBoardCommand from "./commands/switchBoard.mjs";

enum StatusBarItemKey {
  compile = "raspberry-pi-pico.compileProject",
  run = "raspberry-pi-pico.runProject",
  picoSDKQuickPick = "raspberry-pi-pico.sdk-quick-pick",
  picoBoardQuickPick = "raspberry-pi-pico.board-quick-pick",
}

const STATUS_BAR_ITEMS: {
  [key: string]: {
    text: string;
    rustText?: string;
    command: string;
    tooltip: string;
    rustSupport: boolean;
    zephyrSupport: boolean;
  };
} = {
  [StatusBarItemKey.compile]: {
    // alt. "$(gear) Compile"
    text: "$(file-binary) Compile",
    command: `${extensionName}.${CompileProjectCommand.id}`,
    tooltip: "Compile Project",
    rustSupport: true,
    zephyrSupport: true,
  },
  [StatusBarItemKey.run]: {
    // alt. "$(gear) Compile"
    text: "$(run) Run",
    command: `${extensionName}.${RunProjectCommand.id}`,
    tooltip: "Run Project",
    rustSupport: true,
    zephyrSupport: true,
  },
  [StatusBarItemKey.picoSDKQuickPick]: {
    text: "Pico SDK: <version>",
    command: `${extensionName}.${SwitchSDKCommand.id}`,
    tooltip: "Select Pico SDK",
    rustSupport: false,
    zephyrSupport: false,
  },
  [StatusBarItemKey.picoBoardQuickPick]: {
    text: "Board: <board>",
    rustText: "Chip: <chip>",
    // TODO: zephyrCommand option to zwphyr switch borad command or merge them that better
    command: `${extensionName}.${SwitchBoardCommand.id}`,
    tooltip: "Select Chip",
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
      .forEach(item => item.show());
  }

  public updateSDKVersion(version: string): void {
    this._items[StatusBarItemKey.picoSDKQuickPick].text = STATUS_BAR_ITEMS[
      StatusBarItemKey.picoSDKQuickPick
    ].text.replace("<version>", version);
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
