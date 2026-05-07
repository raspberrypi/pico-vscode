import { existsSync } from "fs";
import { join } from "path";
import { ProgressLocation, window, type WorkspaceFolder } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import {
  downloadAndInstallRust,
  installLatestRustRequirements,
  rustProjectGetSelectedChip,
} from "../utils/rustUtil.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import { HOME_VAR } from "../settings.mjs";
import { homedir } from "os";
import type {
  EnsureDependenciesInput,
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectSelections,
  UpdateProjectUiInput,
} from "./types.mjs";
import { ensureBasePicoDependencies } from "./common.mjs";

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
    const latest = await vb.getLatest();
    if (latest === undefined) {
      void window.showErrorMessage(
        "Failed to get latest version bundles. " +
          "Please try again and check your settings."
      );

      return false;
    }

    const supportedToolchains = await getSupportedToolchains(
      input.context.extensionUri
    );
    const toolchainVersion = input.selections.target?.includes("riscv")
      ? latest[1].riscvToolchain
      : latest[1].toolchain;
    if (
      supportedToolchains.find(
        toolchain => toolchain.version === toolchainVersion
      ) === undefined
    ) {
      void window.showErrorMessage(
        "Failed to get default toolchain. " +
          "Please try again and check your internet connection."
      );

      return false;
    }
    input.selections.toolchainVersion = toolchainVersion;
    input.selections.picotoolVersion = latest[1].picotool;

    const python3Path = await findPython();
    if (!python3Path) {
      Logger.error(
        LoggerSource.downloader,
        "Failed to find Python3 executable."
      );
      showPythonNotFoundError();

      return false;
    }

    const baseDependenciesInstalled = await ensureBasePicoDependencies({
      extensionUri: input.context.extensionUri,
      selections: input.selections,
      python3Path: python3Path.replace(
        HOME_VAR,
        homedir().replaceAll("\\", "/")
      ),
      title:
        "Downloading and installing latest Pico SDK (" +
        latestSDK +
        "). This may take a while...",
      sdkFailureMessage:
        "Failed to install latest SDK version for rust project.",
      sdkLogFailurePrefix: "Failed to install latest SDK",
      sdkLogSuccessPrefix: "Found/installed latest SDK",
    });
    if (!baseDependenciesInstalled) {
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

    return installLatestRustRequirements(input.context.extensionUri, {
      skipSdk: true,
    });
  }

  public updateUi(input: UpdateProjectUiInput): void {
    input.ui.showStatusBarItems(true);
    input.ui.updateBoard(input.selections.boardLabel ?? "N/A");
  }
}
