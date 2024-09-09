import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import {
  commands, ProgressLocation, window, workspace, type Uri
} from "vscode";
import { existsSync, readdirSync, readFileSync } from "fs";
import {
  buildSDKPath, downloadAndInstallToolchain
} from "../utils/download.mjs";
import {
  cmakeGetSelectedToolchainAndSDKVersions,
  cmakeUpdateBoard,
  cmakeUpdateSDK,
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { compareLtMajor } from "../utils/semverUtil.mjs";
import type UI from "../ui.mjs";
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";

export default class SwitchBoardCommand extends Command {
  private _versionBundlesLoader: VersionBundlesLoader;
  public static readonly id = "switchBoard";

  constructor(private readonly _ui: UI, extensionUri: Uri) {
    super(SwitchBoardCommand.id);

    this._versionBundlesLoader = new VersionBundlesLoader(extensionUri);
  }

  public static async askBoard(sdkVersion: string):
      Promise<[string, boolean] | undefined> {
    const quickPickItems: string[] = ["pico", "pico_w"];

    if (!compareLtMajor(sdkVersion, "2.0.0")) {
      quickPickItems.push("pico2");
    }

    const sdkPath = buildSDKPath(sdkVersion);

    readdirSync(join(sdkPath, "src", "boards", "include", "boards")).forEach(
      file => {
        quickPickItems.push(file.split(".")[0]);
      }
    );

    // show quick pick for board type
    const board = await window.showQuickPick(quickPickItems, {
      placeHolder: "Select Board",
    });

    if (board === undefined) {

      return board;
    }

    // Check that board doesn't have an RP2040 on it
    const data = readFileSync(
      join(sdkPath, "src", "boards", "include", "boards", `${board}.h`)
    )

    if (data.includes("rp2040")) {

      return [board, false];
    }

    const useRiscV = await window.showQuickPick(["No", "Yes"], {
      placeHolder: "Use Risc-V?",
    });

    if (useRiscV === undefined) {

      return undefined;
    }

    return [board, useRiscV === "Yes"];
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
      )

      if (selectedToolchain === undefined) {
        void window.showErrorMessage(
          "Error switching to Risc-V toolchain"
        );

        return;
      }

      await window.withProgress(
          {
            title:
              `Installing toolchain ${selectedToolchain.version} `,
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
              selectedToolchain.version
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
      )
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
