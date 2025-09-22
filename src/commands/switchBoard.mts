import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import {
  commands,
  ProgressLocation,
  type Uri,
  window,
  workspace,
  type WorkspaceFolder,
} from "vscode";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import {
  buildSDKPath,
  downloadAndInstallToolchain,
} from "../utils/download.mjs";
import {
  cmakeGetSelectedToolchainAndSDKVersions,
  cmakeUpdateBoard,
  cmakeUpdateSDK,
  cmakeGetPicoVar,
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { resolve } from "path";
import { normalize } from "path";
import { compareLt } from "../utils/semverUtil.mjs";
import type UI from "../ui.mjs";
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import State from "../state.mjs";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import { SWITCH_BOARD } from "./cmdIds.mjs";
import { zephyrTouchTasksJson } from "../utils/setupZephyr.mjs";

interface IBoardFile {
  [key: string]: string;
}

const PICO_BOARD = "pico";
const PICO_W_BOARD = "pico_w";
const PICO2_BOARD = "pico2";
const PICO2_W_BOARD = "pico2_w";

function stringToZephyrBoard(e: string): string {
  if (e === PICO_BOARD) {
    return "rpi_pico";
  } else if (e === PICO_W_BOARD) {
    return "rpi_pico/rp2040/w";
  } else if (e === PICO2_BOARD) {
    return "rpi_pico2/rp2350a/m33";
  } else if (e === PICO2_W_BOARD) {
    return "rpi_pico2/rp2350a/m33/w";
  } else {
    throw new Error(`Unknown Board Type: ${e}`);
  }
}

export default class SwitchBoardCommand extends Command {
  private _logger: Logger = new Logger("SwitchBoardCommand");
  private _versionBundlesLoader: VersionBundlesLoader;

  constructor(private readonly _ui: UI, extensionUri: Uri) {
    super(SWITCH_BOARD);

    this._versionBundlesLoader = new VersionBundlesLoader(extensionUri);
  }

  public static async askBoard(
    sdkVersion: string,
    isZephyrProject = false
  ): Promise<[string, boolean] | undefined> {
    const quickPickItems: string[] = [PICO_BOARD, PICO_W_BOARD];
    const workspaceFolder = workspace.workspaceFolders?.[0];

    if (workspaceFolder === undefined) {
      return;
    }

    if (!compareLt(sdkVersion, "2.0.0")) {
      quickPickItems.push(PICO2_BOARD);
    }
    if (!compareLt(sdkVersion, "2.1.0")) {
      quickPickItems.push(PICO2_W_BOARD);
    }

    const boardFiles: IBoardFile = {};

    if (!isZephyrProject) {
      const sdkPath = buildSDKPath(sdkVersion);
      const boardHeaderDirList = [];
      const ws = workspaceFolder.uri.fsPath;
      const cMakeCachePath = join(ws, "build", "CMakeCache.txt");

      let picoBoardHeaderDirs = cmakeGetPicoVar(
        cMakeCachePath,
        "PICO_BOARD_HEADER_DIRS"
      );

      if (picoBoardHeaderDirs) {
        if (picoBoardHeaderDirs.startsWith("'")) {
          const substrLen = picoBoardHeaderDirs.length - 1;
          picoBoardHeaderDirs = picoBoardHeaderDirs.substring(1, substrLen);
        }

        const picoBoardHeaderDirList = picoBoardHeaderDirs.split(";");
        picoBoardHeaderDirList.forEach(item => {
          let boardPath = resolve(item);
          const normalized = normalize(item);

          //If path is not absolute, join workspace path
          if (boardPath !== normalized) {
            boardPath = join(ws, normalized);
          }

          if (existsSync(boardPath)) {
            boardHeaderDirList.push(boardPath);
          }
        });
      }

      const systemBoardHeaderDir = join(
        sdkPath,
        "src",
        "boards",
        "include",
        "boards"
      );

      boardHeaderDirList.push(systemBoardHeaderDir);

      boardHeaderDirList.forEach(path => {
        readdirSync(path).forEach(file => {
          const fullFilename = join(path, file);
          if (fullFilename.endsWith(".h")) {
            const boardName = file.slice(0, -2); // remove .h
            boardFiles[boardName] = fullFilename;
            quickPickItems.push(boardName);
          }
        });
      });
    }

    // show quick pick for board type
    const board = await window.showQuickPick(quickPickItems, {
      placeHolder: "Select Board",
    });

    if (board === undefined) {
      return;
    } else if (isZephyrProject) {
      return [board, false];
    }

    // Check that board doesn't have an RP2040 on it
    const data = readFileSync(boardFiles[board]);

    if (data.includes("rp2040")) {
      return [board, false];
    }

    const useRiscV = await window.showQuickPick(["No", "Yes"], {
      placeHolder: "Use RISC-V?",
    });

    if (useRiscV === undefined) {
      return;
    }

    return [board, useRiscV === "Yes"];
  }

  async execute(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];
    const isRustProject = State.getInstance().isRustProject;
    const isZephyrProject = State.getInstance().isZephyrProject;

    // check it has a CMakeLists.txt
    if (
      workspaceFolder === undefined ||
      (!existsSync(join(workspaceFolder.uri.fsPath, "CMakeLists.txt")) &&
        !isRustProject)
    ) {
      return;
    }

    if (isRustProject) {
      const board = await window.showQuickPick(
        ["RP2040", "RP2350", "RP2350-RISCV"],
        {
          placeHolder: "Select chip",
          canPickMany: false,
          ignoreFocusOut: false,
          title: "Switch project target chip",
        }
      );

      if (board === undefined) {
        return undefined;
      }

      try {
        writeFileSync(
          join(workspaceFolder.uri.fsPath, ".pico-rs"),
          board.toLowerCase(),
          "utf8"
        );
      } catch (error) {
        this._logger.error(
          `Failed to write .pico-rs file: ${unknownErrorToString(error)}`
        );

        void window.showErrorMessage(
          "Failed to write .pico-rs file. " +
            "Please check the logs for more information."
        );

        return;
      }

      this._ui.updateBoard(board.toUpperCase());
      const toolchain =
        board === "RP2040"
          ? "thumbv6m-none-eabi"
          : board === "RP2350"
          ? "thumbv8m.main-none-eabihf"
          : "riscv32imac-unknown-none-elf";

      await workspace
        .getConfiguration("rust-analyzer")
        .update("cargo.target", toolchain, null);

      return;
    }

    if (isZephyrProject) {
      await this._switchBoardZephyr(workspaceFolder);
    } else {
      await this._switchBoardPicoSDK(workspaceFolder);
    }
  }

  private async _switchBoardZephyr(wsf: WorkspaceFolder): Promise<void> {
    const latestSdkVersion = await this._versionBundlesLoader.getLatestSDK();
    if (latestSdkVersion === undefined) {
      void window.showErrorMessage(
        "Failed to get latest SDK version - cannot update board"
      );

      return;
    }
    const boardRes = await SwitchBoardCommand.askBoard(latestSdkVersion, true);

    if (boardRes === undefined) {
      this._logger.info("User cancelled board type selection.");

      return;
    }

    const board = stringToZephyrBoard(boardRes[0]);
    const taskJsonFile = join(wsf.uri.fsPath, ".vscode", "tasks.json");
    await zephyrTouchTasksJson(taskJsonFile, board);

    // TODO: maybe reload cmake
  }

  private async _switchBoardPicoSDK(
    workspaceFolder: WorkspaceFolder
  ): Promise<void> {
    const versions = await cmakeGetSelectedToolchainAndSDKVersions(
      workspaceFolder.uri
    );

    if (versions === null) {
      void window.showErrorMessage(
        "Failed to get sdk version - cannot update board"
      );

      return;
    }

    const boardRes = await SwitchBoardCommand.askBoard(versions[0]);

    if (boardRes === undefined) {
      Logger.log("User cancelled board type selection.");

      return;
    }

    const board = boardRes[0];
    const useRiscV = boardRes[1];

    Logger.log(`Use risc-v is ${useRiscV}`);

    const versionBundle = await this._versionBundlesLoader.getModuleVersion(
      versions[0]
    );

    if (versionBundle === undefined) {
      void window.showErrorMessage(
        `Cannot switch board automatically with SDK version ${versions[0]}`
      );

      return;
    }

    const armToolchain = versionBundle?.toolchain;
    const riscvToolchain = versionBundle?.riscvToolchain;

    const chosenToolchainVersion = useRiscV ? riscvToolchain : armToolchain;

    if (chosenToolchainVersion !== versions[1]) {
      const supportedToolchainVersions = await getSupportedToolchains();

      if (supportedToolchainVersions.length === 0) {
        // internet is not required if locally cached version bundles are available
        // but in this case a use shouldn't see this message
        void window.showErrorMessage(
          "Failed to get supported toolchain versions. " +
            "Make sure you are connected to the internet."
        );

        return;
      }

      const selectedToolchain = supportedToolchainVersions.find(
        t => t.version === chosenToolchainVersion
      );

      if (selectedToolchain === undefined) {
        void window.showErrorMessage("Error switching to Risc-V toolchain");

        return;
      }

      await window.withProgress(
        {
          title: `Installing toolchain ${selectedToolchain.version} `,
          location: ProgressLocation.Notification,
        },
        async progress => {
          if (await downloadAndInstallToolchain(selectedToolchain)) {
            progress.report({
              increment: 40,
            });
            await updateVSCodeStaticConfigs(
              workspaceFolder.uri.fsPath,
              versions[0],
              selectedToolchain.version,
              versions[2]
            );
            progress.report({
              increment: 20,
            });

            const cmakeUpdateResult = await cmakeUpdateSDK(
              workspaceFolder.uri,
              versions[0],
              selectedToolchain.version,
              versions[2],
              false
            );
            progress.report({
              increment: 20,
            });

            if (!cmakeUpdateResult) {
              void window.showWarningMessage(
                "Failed to update CMakeLists.txt for new toolchain version."
              );
            }
          }
        }
      );
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
