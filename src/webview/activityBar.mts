import {
  type Command,
  TreeItem,
  type TreeDataProvider,
  EventEmitter,
  type Event,
  TreeItemCollapsibleState,
  ThemeIcon,
  l10n,
} from "vscode";
import Logger from "../logger.mjs";
import { extensionName } from "../commands/command.mjs";
import {
  DocumentationId,
  getDocumentationLabel,
} from "../commands/openSdkDocumentation.mjs";
import {
  CLEAN_CMAKE,
  COMPILE_PROJECT,
  CONDITIONAL_DEBUGGING,
  CONFIGURE_CMAKE,
  DEBUG_LAYOUT,
  FLASH_PROJECT_SWD,
  IMPORT_PROJECT,
  NEW_EXAMPLE_PROJECT,
  NEW_PROJECT,
  OPEN_SDK_DOCUMENTATION,
  OPEN_UNINSTALLER,
  RUN_PROJECT,
  SWITCH_BOARD,
  SWITCH_BUILD_TYPE,
  SWITCH_SDK,
} from "../commands/cmdIds.mjs";
import { ProjectLang } from "../models/projectLang.mjs";

/**
 * Identifies a Quick Access tree item independently of its (translated) label.
 */
enum QuickAccessItem {
  commonCommandsParent = "commonCommandsParent",
  projectCommandsParent = "projectCommandsParent",
  documentationCommandsParent = "documentationCommandsParent",

  newCCppProject = "newCCppProject",
  newMicroPythonProject = "newMicroPythonProject",
  newRustProject = "newRustProject",
  newZephyrProject = "newZephyrProject",
  importProject = "importProject",
  exampleProject = "exampleProject",
  switchSdk = "switchSdk",
  switchBoard = "switchBoard",
  compileProject = "compileProject",
  runProject = "runProject",
  flashProject = "flashProject",
  configureCmakeProject = "configureCmakeProject",
  cleanCmakeProject = "cleanCmakeProject",
  switchBuildType = "switchBuildType",
  debugProject = "debugProject",
  debugLayoutProject = "debugLayoutProject",
  manageComponents = "manageComponents",

  docHardware = "docHardware",
  docHighLevel = "docHighLevel",
  docNetworking = "docNetworking",
  docRuntimeInfrastructure = "docRuntimeInfrastructure",
}

function quickAccessLabel(item: QuickAccessItem): string {
  switch (item) {
    case QuickAccessItem.commonCommandsParent:
      return l10n.t({
        message: "General",
        comment: ["Quick Access tree group of general commands"],
      });
    case QuickAccessItem.projectCommandsParent:
      return l10n.t({
        message: "Project",
        comment: ["Quick Access tree group of project commands"],
      });
    case QuickAccessItem.documentationCommandsParent:
      return l10n.t({
        message: "Documentation",
        comment: ["Quick Access tree group of documentation links"],
      });
    case QuickAccessItem.newCCppProject:
      return l10n.t("New C/C++ Project");
    case QuickAccessItem.newMicroPythonProject:
      return l10n.t("New MicroPython Project");
    case QuickAccessItem.newRustProject:
      return l10n.t("New Rust Project");
    case QuickAccessItem.newZephyrProject:
      return l10n.t("New Zephyr Project");
    case QuickAccessItem.importProject:
      return l10n.t("Import Project");
    case QuickAccessItem.exampleProject:
      return l10n.t("New Project From Example");
    case QuickAccessItem.switchSdk:
      return l10n.t("Switch SDK");
    case QuickAccessItem.switchBoard:
      return l10n.t("Switch Board");
    case QuickAccessItem.compileProject:
      return l10n.t("Compile Project");
    case QuickAccessItem.runProject:
      return l10n.t("Run Project (USB)");
    case QuickAccessItem.flashProject:
      return l10n.t("Flash Project (SWD)");
    case QuickAccessItem.configureCmakeProject:
      return l10n.t("Configure CMake");
    case QuickAccessItem.cleanCmakeProject:
      return l10n.t("Clean CMake");
    case QuickAccessItem.switchBuildType:
      return l10n.t("Switch Build Type");
    case QuickAccessItem.debugProject:
      return l10n.t("Debug Project");
    case QuickAccessItem.debugLayoutProject:
      return l10n.t("Debug Layout");
    case QuickAccessItem.manageComponents:
      return l10n.t("Manage Components");
    case QuickAccessItem.docHardware:
      return getDocumentationLabel(DocumentationId.hardware);
    case QuickAccessItem.docHighLevel:
      return getDocumentationLabel(DocumentationId.highLevel);
    case QuickAccessItem.docNetworking:
      return getDocumentationLabel(DocumentationId.networking);
    case QuickAccessItem.docRuntimeInfrastructure:
      return getDocumentationLabel(DocumentationId.runtimeInfrastructure);
  }
}

export class QuickAccessCommand extends TreeItem {
  public readonly label: string;

  constructor(
    public readonly item: QuickAccessItem,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly command?: Command
  ) {
    const label = quickAccessLabel(item);
    super(label, collapsibleState);
    this.label = label;
  }
}

/**
 * Creates a leaf item that runs an extension command, titled with its label.
 */
function commandItem(
  item: QuickAccessItem,
  commandId: string,
  args?: unknown[]
): QuickAccessCommand {
  return new QuickAccessCommand(item, TreeItemCollapsibleState.None, {
    command: `${extensionName}.${commandId}`,
    title: quickAccessLabel(item),
    arguments: args,
  });
}

export class PicoProjectActivityBar
  implements TreeDataProvider<QuickAccessCommand>
{
  public static readonly viewType = "raspberry-pi-pico-project-quick-access";
  private _sdkVersion?: string;
  private _board?: string;
  private _buildType?: string;

  private _onDidChangeTreeData = new EventEmitter<
    QuickAccessCommand | undefined | void
  >();
  readonly onDidChangeTreeData: Event<QuickAccessCommand | undefined | void> =
    this._onDidChangeTreeData.event;

  private _logger: Logger = new Logger("PicoProjectActivityBar");

  constructor() {}

  public refreshSDK(newPicoSDKVersion?: string): void {
    if (newPicoSDKVersion) {
      this._sdkVersion = newPicoSDKVersion;
    }
    this._onDidChangeTreeData.fire();
  }

  public refreshBoard(newBoard?: string): void {
    if (newBoard) {
      this._board = newBoard;
    }
    this._onDidChangeTreeData.fire();
  }

  public refreshBuildType(newBuildType?: string): void {
    if (newBuildType) {
      this._buildType = newBuildType;
    }
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(
    element: QuickAccessCommand
  ): TreeItem | Thenable<TreeItem> {
    const notAvailable = l10n.t({
      message: "N/A",
      comment: ["Shown when a value is not available"],
    });

    switch (element.item) {
      case QuickAccessItem.newCCppProject:
        // alt. "new-folder"
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case QuickAccessItem.newMicroPythonProject:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case QuickAccessItem.newRustProject:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case QuickAccessItem.newZephyrProject:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case QuickAccessItem.importProject:
        // alt. "repo-pull"
        element.iconPath = new ThemeIcon("repo-clone");
        break;
      case QuickAccessItem.exampleProject:
        // alt. "file-code"
        element.iconPath = new ThemeIcon("file-symlink-directory");
        break;
      case QuickAccessItem.manageComponents:
        element.iconPath = new ThemeIcon("package");
        break;

      case QuickAccessItem.debugProject:
        element.iconPath = new ThemeIcon("debug-alt");
        break;
      case QuickAccessItem.compileProject:
        // alt. "gear", "notifications-configure"
        element.iconPath = new ThemeIcon("file-binary");
        break;
      case QuickAccessItem.runProject:
        element.iconPath = new ThemeIcon("run");
        break;
      case QuickAccessItem.flashProject:
        element.iconPath = new ThemeIcon("desktop-download");
        break;
      case QuickAccessItem.configureCmakeProject:
        // alt. "gather"
        element.iconPath = new ThemeIcon("beaker");
        break;
      case QuickAccessItem.cleanCmakeProject:
        // or "trash" or "sync"
        element.iconPath = new ThemeIcon("squirrel");
        break;
      case QuickAccessItem.switchBuildType:
        element.iconPath = new ThemeIcon("gear");
        element.description = this._buildType ?? notAvailable;
        break;
      case QuickAccessItem.switchSdk:
        // repo-forked or extensions; alt. "replace-all"
        element.iconPath = new ThemeIcon("find-replace-all");
        element.description = this._sdkVersion ?? notAvailable;
        break;
      case QuickAccessItem.switchBoard:
        element.iconPath = new ThemeIcon("circuit-board");
        element.description = this._board ?? notAvailable;
        break;
      case QuickAccessItem.debugLayoutProject:
        element.iconPath = new ThemeIcon("debug-console");
        break;

      case QuickAccessItem.docHardware:
        element.iconPath = new ThemeIcon("device-camera");
        break;
      case QuickAccessItem.docHighLevel:
        element.iconPath = new ThemeIcon("device-camera-video");
        break;
      case QuickAccessItem.docNetworking:
        element.iconPath = new ThemeIcon("server");
        break;
      case QuickAccessItem.docRuntimeInfrastructure:
        element.iconPath = new ThemeIcon("server-process");
        break;
    }

    return element;
  }

  public getChildren(element?: QuickAccessCommand): QuickAccessCommand[] {
    if (element === undefined) {
      return [
        new QuickAccessCommand(
          QuickAccessItem.commonCommandsParent,
          TreeItemCollapsibleState.Expanded
        ),
        new QuickAccessCommand(
          QuickAccessItem.projectCommandsParent,
          TreeItemCollapsibleState.Expanded
        ),
        new QuickAccessCommand(
          QuickAccessItem.documentationCommandsParent,
          TreeItemCollapsibleState.Expanded
        ),
      ];
    } else if (element.item === QuickAccessItem.commonCommandsParent) {
      return [
        commandItem(QuickAccessItem.newCCppProject, NEW_PROJECT, [
          ProjectLang.cCpp,
        ]),
        commandItem(QuickAccessItem.newMicroPythonProject, NEW_PROJECT, [
          ProjectLang.micropython,
        ]),
        commandItem(QuickAccessItem.newRustProject, NEW_PROJECT, [
          ProjectLang.rust,
        ]),
        commandItem(QuickAccessItem.newZephyrProject, NEW_PROJECT, [
          ProjectLang.zephyr,
        ]),
        commandItem(QuickAccessItem.importProject, IMPORT_PROJECT),
        commandItem(QuickAccessItem.exampleProject, NEW_EXAMPLE_PROJECT, [
          true,
        ]),
        commandItem(QuickAccessItem.manageComponents, OPEN_UNINSTALLER),
      ];
    } else if (element.item === QuickAccessItem.projectCommandsParent) {
      return [
        commandItem(QuickAccessItem.debugProject, CONDITIONAL_DEBUGGING),
        commandItem(QuickAccessItem.compileProject, COMPILE_PROJECT),
        commandItem(QuickAccessItem.runProject, RUN_PROJECT),
        commandItem(QuickAccessItem.flashProject, FLASH_PROJECT_SWD),
        commandItem(QuickAccessItem.configureCmakeProject, CONFIGURE_CMAKE),
        commandItem(QuickAccessItem.cleanCmakeProject, CLEAN_CMAKE),
        commandItem(QuickAccessItem.switchBuildType, SWITCH_BUILD_TYPE),
        commandItem(QuickAccessItem.switchSdk, SWITCH_SDK),
        commandItem(QuickAccessItem.switchBoard, SWITCH_BOARD),
        commandItem(QuickAccessItem.debugLayoutProject, DEBUG_LAYOUT),
      ];
    } else if (element.item === QuickAccessItem.documentationCommandsParent) {
      return [
        commandItem(QuickAccessItem.docHardware, OPEN_SDK_DOCUMENTATION, [
          DocumentationId.hardware,
        ]),
        commandItem(QuickAccessItem.docHighLevel, OPEN_SDK_DOCUMENTATION, [
          DocumentationId.highLevel,
        ]),
        commandItem(QuickAccessItem.docNetworking, OPEN_SDK_DOCUMENTATION, [
          DocumentationId.networking,
        ]),
        commandItem(
          QuickAccessItem.docRuntimeInfrastructure,
          OPEN_SDK_DOCUMENTATION,
          [DocumentationId.runtimeInfrastructure]
        ),
      ];
    } else {
      return [];
    }
  }
}
