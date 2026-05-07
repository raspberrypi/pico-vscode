import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  commands,
  ProgressLocation,
  window,
  type WorkspaceFolder,
} from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import { ContextKeys } from "../contextKeys.mjs";
import { SettingsKey } from "../settings.mjs";
import {
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX,
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD,
  cmakeGetSelectedBoard,
  cmakeGetSelectedToolchainAndSDKVersions,
} from "../utils/cmakeUtil.mjs";
import {
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
} from "../utils/download.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import {
  OPENOCD_VERSION,
  SDK_REPOSITORY_URL,
} from "../utils/sharedConstants.mjs";
import { cmakeToolsForcePicoKit } from "../utils/cmakeToolsUtil.mjs";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import type {
  AfterActivationInput,
  EnsureDependenciesInput,
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectSelections,
  UpdateProjectUiInput,
} from "./types.mjs";
import { ensureManagedTool, withDownloadProgress } from "./common.mjs";
import { cmakeSetupAutoConfigure } from "./cmakeActivation.mjs";

export class CCppProjectVariant implements PicoProjectVariant {
  public readonly id = "c-cpp";
  public readonly context = {
    isPicoProject: true,
    isRustProject: false,
    isZephyrProject: false,
  };

  public detect(folder: WorkspaceFolder): ProjectDetectionResult {
    const cmakeListsFilePath = join(folder.uri.fsPath, "CMakeLists.txt");
    if (!existsSync(cmakeListsFilePath)) {
      return {
        kind: "unsupported",
        reason: "No CMakeLists.txt in workspace folder has been found.",
      };
    }

    const cmakeListsContents = readFileSync(cmakeListsFilePath, "utf-8");
    if (!cmakeListsContents.includes("pico_sdk_init()")) {
      return {
        kind: "unsupported",
        reason: "No pico_sdk_init() in CMakeLists.txt found.",
      };
    }

    const hasExtensionHeader =
      cmakeListsContents.includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX) ||
      cmakeListsContents.includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD);
    if (
      !existsSync(join(folder.uri.fsPath, ".vscode")) ||
      !hasExtensionHeader
    ) {
      return {
        kind: "unsupported",
        reason:
          'No .vscode folder and/or cmake "DO NOT EDIT"-header in ' +
          "CMakeLists.txt found.",
        offerImport: true,
      };
    }

    return { kind: "supported", variant: this.id };
  }

  public async readSelections(
    folder: WorkspaceFolder
  ): Promise<ProjectSelections | null> {
    const selectedVersions = await cmakeGetSelectedToolchainAndSDKVersions(
      folder.uri
    );
    if (selectedVersions === null) {
      return null;
    }

    return {
      sdkVersion: selectedVersions[0],
      toolchainVersion: selectedVersions[1],
      picotoolVersion: selectedVersions[2],
      boardId: cmakeGetSelectedBoard(folder.uri) ?? undefined,
      boardLabel: cmakeGetSelectedBoard(folder.uri) ?? "unknown",
    };
  }

  public async ensureDependencies(
    input: EnsureDependenciesInput
  ): Promise<boolean> {
    const { context, selections, settings } = input;
    if (
      selections.sdkVersion === undefined ||
      selections.toolchainVersion === undefined ||
      selections.picotoolVersion === undefined
    ) {
      return false;
    }

    let installSuccess = true;
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title:
          "Downloading and installing Pico SDK as selected. " +
          "This may take a while...",
        cancellable: false,
      },
      async progress => {
        const result = await downloadAndInstallSDK(
          context.extensionUri,
          selections.sdkVersion!,
          SDK_REPOSITORY_URL
        );

        progress.report({ increment: 100 });

        if (!result) {
          installSuccess = false;
          Logger.error(
            LoggerSource.extension,
            "Failed to install project SDK",
            `version: ${selections.sdkVersion}.`,
            "Make sure all requirements are met."
          );
          void window.showErrorMessage(
            "Failed to install project SDK version."
          );
        } else {
          Logger.info(
            LoggerSource.extension,
            "Found/installed project SDK",
            `version: ${selections.sdkVersion}`
          );
        }
      }
    );
    if (!installSuccess) {
      return false;
    }

    const toolchains = await getSupportedToolchains(context.extensionUri);
    const selectedToolchain = toolchains.find(
      toolchain => toolchain.version === selections.toolchainVersion
    );
    if (selectedToolchain === undefined) {
      Logger.error(
        LoggerSource.extension,
        "Failed to detect project toolchain version."
      );
      void window.showErrorMessage(
        "Failed to detect project toolchain version."
      );

      return false;
    }

    installSuccess = await withDownloadProgress(
      "Downloading and installing toolchain as selected. " +
        "This may take a while...",
      progress => downloadAndInstallToolchain(selectedToolchain, progress)
    );
    if (!installSuccess) {
      Logger.error(
        LoggerSource.extension,
        "Failed to install project toolchain",
        `version: ${selections.toolchainVersion}`
      );
      void window.showErrorMessage(
        "Failed to install project toolchain version."
      );

      return false;
    }
    Logger.info(
      LoggerSource.extension,
      "Found/installed project toolchain",
      `version: ${selections.toolchainVersion}`
    );

    installSuccess = await withDownloadProgress(
      "Downloading and installing tools as selected. This may take a while...",
      progress => downloadAndInstallTools(selections.sdkVersion!, progress)
    );
    if (!installSuccess) {
      Logger.error(
        LoggerSource.extension,
        "Failed to install project SDK",
        `version: ${selections.sdkVersion}.`,
        "Make sure all requirements are met."
      );
      void window.showErrorMessage("Failed to install project SDK version.");

      return false;
    }
    Logger.info(
      LoggerSource.extension,
      "Found/installed project SDK",
      `version: ${selections.sdkVersion}`
    );

    installSuccess = await withDownloadProgress(
      "Downloading and installing picotool as selected. " +
        "This may take a while...",
      progress =>
        downloadAndInstallPicotool(selections.picotoolVersion!, progress)
    );
    if (!installSuccess) {
      Logger.error(LoggerSource.extension, "Failed to install picotool.");
      void window.showErrorMessage("Failed to install picotool.");

      return false;
    }
    Logger.debug(LoggerSource.extension, "Found/installed picotool.");

    const openOcdInstalled = await withDownloadProgress(
      "Downloading and installing OpenOCD. This may take a while...",
      progress => downloadAndInstallOpenOCD(OPENOCD_VERSION, progress)
    );
    if (!openOcdInstalled) {
      Logger.error(
        LoggerSource.extension,
        "Failed to download and install OpenOCD."
      );
      void window.showWarningMessage(
        "Failed to download and install OpenOCD."
      );
    } else {
      Logger.debug(LoggerSource.extension, "Found/installed OpenOCD.");
      void window.showInformationMessage(
        "OpenOCD found/installed successfully."
      );
    }

    const ninjaInstalled = await ensureManagedTool(
      settings,
      "ninja",
      downloadAndInstallNinja
    );
    if (!ninjaInstalled) {
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );

      return false;
    }

    const cmakeInstalled = await ensureManagedTool(
      settings,
      "cmake",
      downloadAndInstallCmake
    );
    if (!cmakeInstalled) {
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );

      return false;
    }

    const pythonPath = await findPython();
    if (!pythonPath) {
      Logger.error(
        LoggerSource.extension,
        "Failed to find Python3 executable."
      );
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );
      showPythonNotFoundError();

      return false;
    }

    return true;
  }

  public updateUi(input: UpdateProjectUiInput): void {
    input.ui.showStatusBarItems();
    input.ui.updateSDKVersion(input.selections.sdkVersion ?? "unknown");
    input.ui.updateBoard(input.selections.boardLabel ?? "unknown");
  }

  public async afterActivation(input: AfterActivationInput): Promise<boolean> {
    if (input.settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
      await cmakeSetupAutoConfigure(input.folder, input.ui);
    } else if (input.settings.getBoolean(SettingsKey.useCmakeTools)) {
      const kitForced = await cmakeToolsForcePicoKit();
      if (!kitForced) {
        Logger.warn(
          LoggerSource.extension,
          "Failed to force Pico kit in CMake Tools - attempting to do it later"
        );

        setTimeout(() => {
          void cmakeToolsForcePicoKit().catch(error => {
            Logger.error(
              LoggerSource.extension,
              "Failed to force Pico kit in CMake Tools on second attempt",
              unknownErrorToString(error)
            );
          });
        }, 1000);
      }
    } else {
      Logger.info(
        LoggerSource.extension,
        "No workspace folder for configuration found",
        "or cmakeAutoConfigure disabled."
      );
    }

    return true;
  }
}
