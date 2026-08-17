import { existsSync } from "fs";
import { join } from "path";
import {
  FileSystemError,
  Uri,
  window,
  workspace,
  type WorkspaceFolder,
} from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import { SettingsKey } from "../settings.mjs";
import type Settings from "../settings.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import { CMAKELISTS_ZEPHYR_REGEX } from "../utils/sharedConstants.mjs";
import {
  getBoardFromZephyrProject,
  getZephyrVersion,
  setupZephyr,
  updateZephyrCompilerPath,
  updateZephyrVersion,
  zephyrVerifyCMakeCache,
} from "../utils/setupZephyr.mjs";
import {
  ZEPHYR_PICO,
  ZEPHYR_PICO2,
  ZEPHYR_PICO2_W,
  ZEPHYR_PICO_W,
} from "../models/zephyrBoards.mjs";
import type {
  AfterActivationInput,
  EnsureDependenciesInput,
  PicoProjectVariant,
  ProjectDetectionResult,
  ProjectSelections,
  UpdateProjectUiInput,
} from "./types.mjs";
import { cmakeSetupAutoConfigure } from "./cmakeActivation.mjs";
import {
  isManagedToolPath,
  resolveHomePath,
  selectedManagedToolVersion,
} from "./common.mjs";

export class ZephyrProjectVariant implements PicoProjectVariant {
  public readonly id = "zephyr";
  public readonly context = {
    isPicoProject: true,
    isRustProject: false,
    isZephyrProject: true,
  };

  public async detect(
    folder: WorkspaceFolder
  ): Promise<ProjectDetectionResult> {
    const cmakeListsFilePath = join(folder.uri.fsPath, "CMakeLists.txt");
    if (!existsSync(cmakeListsFilePath)) {
      return {
        kind: "unsupported",
        reason: "No CMakeLists.txt in workspace folder has been found.",
      };
    }

    const cmakeListsContents = new TextDecoder().decode(
      await workspace.fs.readFile(Uri.file(cmakeListsFilePath))
    );
    if (cmakeListsContents.trimStart().match(CMAKELISTS_ZEPHYR_REGEX)) {
      return { kind: "supported", variant: this.id };
    }

    return {
      kind: "unsupported",
      reason: "CMakeLists.txt does not match the Zephyr Pico project marker.",
    };
  }

  public async readSelections(
    folder: WorkspaceFolder
  ): Promise<ProjectSelections> {
    const board = await getBoardFromZephyrProject(
      join(folder.uri.fsPath, ".vscode", "tasks.json")
    );

    return {
      boardId: board,
      boardLabel: board === undefined ? undefined : zephyrBoardLabel(board),
      chip: zephyrBoardChip(board),
      target: zephyrBoardTarget(board),
    };
  }

  public async ensureDependencies(
    input: EnsureDependenciesInput
  ): Promise<boolean> {
    Logger.info(LoggerSource.extension, "Project is of type: Zephyr");

    const vb = new VersionBundlesLoader(input.context.extensionUri);
    const latest = await vb.getLatest();
    if (latest === undefined) {
      Logger.error(
        LoggerSource.extension,
        "Failed to get latest version bundle for Zephyr project."
      );
      void window.showErrorMessage(
        "Failed to get latest version bundle for Zephyr project."
      );

      return false;
    }

    const cmakePath = input.settings.getString(SettingsKey.cmakePath);
    if (cmakePath === undefined) {
      Logger.error(
        LoggerSource.extension,
        "CMake path not set in settings. Cannot setup Zephyr project."
      );
      void window.showErrorMessage(
        "CMake path not set in settings. Cannot setup Zephyr project."
      );

      return false;
    }

    const cmakeVersion = selectedManagedToolVersion(cmakePath, "cmake") ?? "";
    if (isManagedToolPath(cmakePath, "cmake") && cmakeVersion === "") {
      Logger.error(
        LoggerSource.extension,
        "Failed to get CMake version from path in the settings."
      );

      return false;
    }

    const ninjaPath = input.settings.getString(SettingsKey.ninjaPath);
    if (ninjaPath === undefined) {
      Logger.error(
        LoggerSource.extension,
        "Ninja path not set in settings. Cannot setup Zephyr project."
      );
      void window.showErrorMessage(
        "Ninja path not set in settings. Cannot setup Zephyr project."
      );

      return false;
    }
    const ninjaVersion = selectedManagedToolVersion(ninjaPath, "ninja") ?? "";
    if (isManagedToolPath(ninjaPath, "ninja") && ninjaVersion === "") {
      Logger.error(
        LoggerSource.extension,
        "Failed to get Ninja version from path in the settings."
      );

      return false;
    }

    const pinnedVersion = input.settings.getString(SettingsKey.zephyrVersion);
    if (pinnedVersion !== undefined && pinnedVersion.length > 0) {
      const switched = await ensurePinnedZephyrVersion(
        input.settings,
        pinnedVersion
      );
      if (!switched) {
        return false;
      }
    }

    const result = await setupZephyr({
      extUri: input.context.extensionUri,
      cmakeMode: cmakeVersion !== "" ? 2 : 3,
      cmakePath: cmakeVersion !== "" ? "" : resolveHomePath(cmakePath),
      cmakeVersion,
      ninjaMode: ninjaVersion !== "" ? 2 : 3,
      ninjaPath: ninjaVersion !== "" ? "" : resolveHomePath(ninjaPath),
      ninjaVersion,
    });
    if (result === undefined) {
      void window.showErrorMessage(
        "Failed to setup Zephyr Toolchain. See logs for details."
      );

      return false;
    }

    void window.showInformationMessage(
      "Zephyr Toolchain setup done. You can now build your project."
    );

    const selectedZephyrVersion = await getZephyrVersion();
    if (selectedZephyrVersion === undefined) {
      Logger.error(
        LoggerSource.extension,
        "Failed to get selected system Zephyr version. Defaulting to main."
      );
    }
    input.selections.sdkVersion = selectedZephyrVersion ?? "main";

    return true;
  }

  public updateUi(input: UpdateProjectUiInput): void {
    input.ui.showStatusBarItems(false, true);
    input.ui.updateSDKVersion(input.selections.sdkVersion ?? "main");
    if (input.selections.boardLabel !== undefined) {
      input.ui.updateBoard(input.selections.boardLabel);
    }
  }

  public async afterActivation(input: AfterActivationInput): Promise<boolean> {
    const selectedZephyrVersion = input.selections.sdkVersion ?? "main";
    const cppCompilerUpdated = await updateZephyrCompilerPath(
      input.folder.uri,
      selectedZephyrVersion
    );

    if (!cppCompilerUpdated) {
      void window.showErrorMessage(
        "Failed to update C++ compiler path in c_cpp_properties.json"
      );
    }

    await zephyrVerifyCMakeCache(input.folder.uri);

    if (input.settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
      await cmakeSetupAutoConfigure(input.folder, input.ui);
    } else {
      await warnIfZephyrBuildFolderIsEmpty(input.folder);
    }

    return true;
  }
}

async function ensurePinnedZephyrVersion(
  settings: Settings,
  pinnedVersion: string
): Promise<boolean> {
  const systemVersion = await getZephyrVersion();
  if (systemVersion === undefined) {
    Logger.error(
      LoggerSource.extension,
      "Failed to get system Zephyr version."
    );
    void window.showErrorMessage(
      "Failed to get system Zephyr version. Cannot setup Zephyr project."
    );

    return false;
  }

  if (systemVersion === pinnedVersion) {
    return true;
  }

  const switchVersion = await window.showInformationMessage(
    `Project Zephyr version (${pinnedVersion}) differs from system ` +
      `version (${systemVersion}). ` +
      "Do you want to switch the system version?",
    { modal: true },
    "Yes",
    "No - Use system version",
    "No - Pin to system version"
  );

  if (switchVersion === "Yes") {
    const switchResult = await updateZephyrVersion(pinnedVersion);
    if (!switchResult) {
      void window.showErrorMessage(
        `Failed to switch Zephyr version to ${pinnedVersion}. ` +
          "Cannot setup Zephyr project."
      );

      return false;
    }

    void window.showInformationMessage(
      `Switched Zephyr version to ${pinnedVersion}.`
    );
    Logger.info(
      LoggerSource.extension,
      `Switched Zephyr version to ${pinnedVersion}.`
    );

    return true;
  }

  if (switchVersion === "No - Pin to system version") {
    await settings.update(SettingsKey.zephyrVersion, systemVersion);
    void window.showInformationMessage(
      `Pinned Zephyr version to ${systemVersion}.`
    );
    Logger.info(
      LoggerSource.extension,
      `Pinned Zephyr version to ${systemVersion}.`
    );
  }

  return true;
}

async function warnIfZephyrBuildFolderIsEmpty(
  folder: WorkspaceFolder
): Promise<void> {
  const buildUri = Uri.file(join(folder.uri.fsPath, "build"));
  try {
    await workspace.fs.stat(buildUri);
    const buildDirContents = await workspace.fs.readDirectory(buildUri);

    if (buildDirContents.length === 0) {
      void window.showWarningMessage(
        "To get full intellisense support please build the project once."
      );
    }
  } catch (error) {
    if (error instanceof FileSystemError && error.code === "FileNotFound") {
      void window.showWarningMessage(
        "To get full intellisense support please build the project once."
      );

      Logger.debug(
        LoggerSource.extension,
        'No "build" folder found. Intellisense might not work ' +
          "properly until a build has been done."
      );
    } else {
      Logger.error(
        LoggerSource.extension,
        "Error when reading build folder:",
        unknownErrorToString(error)
      );
    }
  }
}

function zephyrBoardLabel(board: string): string {
  if (board === ZEPHYR_PICO2_W) {
    return "Pico 2W";
  } else if (board === ZEPHYR_PICO2) {
    return "Pico 2";
  } else if (board === ZEPHYR_PICO_W) {
    return "Pico W";
  } else if (board === ZEPHYR_PICO) {
    return "Pico";
  }

  return "Other";
}

function zephyrBoardChip(
  board: string | undefined
): "rp2040" | "rp2350" | undefined {
  if (board === ZEPHYR_PICO || board === ZEPHYR_PICO_W) {
    return "rp2040";
  }

  if (board === ZEPHYR_PICO2 || board === ZEPHYR_PICO2_W) {
    return "rp2350";
  }

  return undefined;
}

function zephyrBoardTarget(
  board: string | undefined
): "rp2040" | "rp2350" | undefined {
  return zephyrBoardChip(board);
}
