import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { commands, window, workspace, type Uri } from "vscode";
import { existsSync, readdirSync } from "fs";
import { buildSDKPath } from "../utils/download.mjs";
import {
  cmakeGetSelectedToolchainAndSDKVersions, cmakeUpdateBoard
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { compareLtMajor } from "../utils/semverUtil.mjs";
import type UI from "../ui.mjs";

export default class SwitchBoardCommand extends Command {
  public static readonly id = "switchBoard";

  constructor(private readonly _ui: UI) {
    super(SwitchBoardCommand.id);
  }

  public static async askBoard(
    folder: Uri
  ): Promise<string | undefined> {
    const quickPickItems: string[] = [
      "pico",
      "pico_w"
    ];

    const versions = cmakeGetSelectedToolchainAndSDKVersions(
      join(folder.fsPath, "CMakeLists.txt")
    );

    if (versions === null) {
      void window.showErrorMessage(
        "Failed to get sdk version - cannot update board"
      );

      return;
    }

    const sdkVersion = versions[0];

    if (!compareLtMajor(sdkVersion, "2.0.0")) {
      quickPickItems.push("pico2");
    }

    const sdkPath = buildSDKPath(sdkVersion);

    readdirSync(join(
      sdkPath, "src", "boards", "include", "boards"
    )).forEach(file => {
      quickPickItems.push(file.split(".")[0]);
    });

    // show quick pick for board type
    const board = await window.showQuickPick(quickPickItems, {
      placeHolder: "Select Board",
    });

    return board;
  }

  async execute(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];

    // check it has a CMakeLists.txt
    if (
      workspaceFolder === undefined ||
      !existsSync(join(workspaceFolder.uri.fsPath, "CMakeLists.txt"))
    ) {
  
      return;
    }

    const board = await SwitchBoardCommand.askBoard(workspaceFolder.uri);

    if (board === undefined) {
      Logger.log("User cancelled board type selection.");

      return;
    }

    const success = await cmakeUpdateBoard(workspaceFolder.uri, board);
    if (success) {
      this._ui.updateBoard(board);

      const reloadWindowBtn = "Reload Window";
      // notify user that reloading the window is
      // recommended to update intellisense
      const reload = await window.showInformationMessage(
        "It is recommended to reload the window to update intellisense " +
          "with the new board.",
        reloadWindowBtn
      );

      if (reload === reloadWindowBtn) {
        void commands.executeCommand("workbench.action.reloadWindow");
      }
    }
  }
}
