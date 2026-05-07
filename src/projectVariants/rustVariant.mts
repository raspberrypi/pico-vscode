import { existsSync } from "fs";
import { join } from "path";
import { ProgressLocation, window, type WorkspaceFolder } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import {
  downloadAndInstallRust,
  installLatestRustRequirements,
  rustProjectGetSelectedChip,
} from "../utils/rustUtil.mjs";
import { downloadAndInstallSDK } from "../utils/download.mjs";
import { SDK_REPOSITORY_URL } from "../utils/sharedConstants.mjs";
import type {
  EnsureDependenciesInput,
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectSelections,
  UpdateProjectUiInput,
} from "./types.mjs";

export class RustProjectVariant implements PicoProjectVariant {
  public readonly id = "rust";
  public readonly context = {
    isPicoProject: true,
    isRustProject: true,
    isZephyrProject: false,
  };

  public detect(folder: WorkspaceFolder): ProjectDetectionResult {
    if (existsSync(join(folder.uri.fsPath, ".pico-rs"))) {
      return { kind: "supported", variant: this.id };
    }

    return {
      kind: "unsupported",
      reason: "No .pico-rs marker file was found.",
    };
  }

  public readSelections(folder: WorkspaceFolder): ProjectSelections {
    const chip = rustProjectGetSelectedChip(folder.uri.fsPath);

    return {
      chip: chip ?? undefined,
      target: chip ?? undefined,
      boardLabel: chip !== null ? chip.toUpperCase() : "N/A",
    };
  }

  public async ensureDependencies(
    input: EnsureDependenciesInput
  ): Promise<boolean> {
    const vb = new VersionBundlesLoader(input.context.extensionUri);
    const latestSDK = await vb.getLatestSDK();
    if (!latestSDK) {
      Logger.error(
        LoggerSource.extension,
        "Failed to get latest Pico SDK version for Rust project."
      );
      void window.showErrorMessage(
        "Failed to get latest Pico SDK version for Rust project."
      );

      return false;
    }

    input.selections.sdkVersion = latestSDK;

    const sdk = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title:
          "Downloading and installing latest Pico SDK (" +
          latestSDK +
          "). This may take a while...",
        cancellable: false,
      },
      async progress => {
        const result = await downloadAndInstallSDK(
          input.context.extensionUri,
          latestSDK,
          SDK_REPOSITORY_URL
        );

        progress.report({ increment: 100 });

        if (!result) {
          Logger.error(
            LoggerSource.extension,
            "Failed to install latest SDK",
            `version: ${latestSDK}.`,
            "Make sure all requirements are met."
          );
          void window.showErrorMessage(
            "Failed to install latest SDK version for rust project."
          );

          return false;
        }

        Logger.info(
          LoggerSource.extension,
          "Found/installed latest SDK",
          `version: ${latestSDK}`
        );

        return true;
      }
    );
    if (!sdk) {
      return false;
    }

    const cargo = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Downloading and installing Rust. This may take a while...",
        cancellable: false,
      },
      async () => downloadAndInstallRust()
    );
    if (!cargo) {
      void window.showErrorMessage("Failed to install Rust.");

      return false;
    }

    return installLatestRustRequirements(input.context.extensionUri);
  }

  public updateUi(input: UpdateProjectUiInput): void {
    input.ui.showStatusBarItems(true);
    input.ui.updateBoard(input.selections.boardLabel ?? "N/A");
  }
}
