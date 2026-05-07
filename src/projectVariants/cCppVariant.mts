import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  commands,
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
} from "../utils/download.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
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
import {
  ensureBasePicoDependencies,
  ensureManagedTool,
} from "./common.mjs";
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

    const baseDependenciesInstalled = await ensureBasePicoDependencies({
      extensionUri: context.extensionUri,
      selections,
      title:
        "Downloading and installing Pico SDK as selected. " +
        "This may take a while...",
      sdkFailureMessage: "Failed to install project SDK version.",
      sdkLogFailurePrefix: "Failed to install project SDK",
      sdkLogSuccessPrefix: "Found/installed project SDK",
    });
    if (!baseDependenciesInstalled) {
      return false;
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
