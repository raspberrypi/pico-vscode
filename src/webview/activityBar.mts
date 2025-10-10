import {
  type Command,
  TreeItem,
  type TreeDataProvider,
  EventEmitter,
  type Event,
  TreeItemCollapsibleState,
  ThemeIcon,
} from "vscode";
import Logger from "../logger.mjs";
import { extensionName } from "../commands/command.mjs";
import {
  DOCUMENTATION_LABEL_BY_ID,
  DocumentationId,
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

export class QuickAccessCommand extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);
  }
}

const COMMON_COMMANDS_PARENT_LABEL = "General";
const PROJECT_COMMANDS_PARENT_LABEL = "Project";
const DOCUMENTATION_COMMANDS_PARENT_LABEL = "Documentation";

const NEW_C_CPP_PROJECT_LABEL = "New C/C++ Project";
const NEW_MICROPYTHON_PROJECT_LABEL = "New MicroPython Project";
const NEW_RUST_PROJECT_LABEL = "New Rust Project";
const NEW_ZEPHYR_PROJECT_LABEL = "New Zephyr Project";
const IMPORT_PROJECT_LABEL = "Import Project";
const EXAMPLE_PROJECT_LABEL = "New Project From Example";
const SWITCH_SDK_LABEL = "Switch SDK";
const SWITCH_BOARD_LABEL = "Switch Board";
const COMPILE_PROJECT_LABEL = "Compile Project";
const RUN_PROJECT_LABEL = "Run Project (USB)";
const FLASH_PROJECT_LABEL = "Flash Project (SWD)";
const CONFIGURE_CMAKE_PROJECT_LABEL = "Configure CMake";
const CLEAN_CMAKE_PROJECT_LABEL = "Clean CMake";
const SWITCH_BUILD_TYPE_LABEL = "Switch Build Type";
const DEBUG_PROJECT_LABEL = "Debug Project";
const DEBUG_LAYOUT_PROJECT_LABEL = "Debug Layout";
const MANAGE_COMPONENTS_LABEL = "Manage Components";

export class PicoProjectActivityBar
  implements TreeDataProvider<QuickAccessCommand>
{
  public static readonly viewType = "raspberry-pi-pico-project-quick-access";
  private _sdkVersion: string = "N/A";
  private _board: string = "N/A";
  private _buildType: string = "N/A";

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
    switch (element.label) {
      case NEW_C_CPP_PROJECT_LABEL:
        // alt. "new-folder"
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case NEW_MICROPYTHON_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case NEW_RUST_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case NEW_ZEPHYR_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("file-directory-create");
        break;
      case IMPORT_PROJECT_LABEL:
        // alt. "repo-pull"
        element.iconPath = new ThemeIcon("repo-clone");
        break;
      case EXAMPLE_PROJECT_LABEL:
        // alt. "file-code"
        element.iconPath = new ThemeIcon("file-symlink-directory");
        break;
      case MANAGE_COMPONENTS_LABEL:
        element.iconPath = new ThemeIcon("package");
        break;

      case DEBUG_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("debug-alt");
        break;
      case COMPILE_PROJECT_LABEL:
        // alt. "gear", "notifications-configure"
        element.iconPath = new ThemeIcon("file-binary");
        break;
      case RUN_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("run");
        break;
      case FLASH_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("desktop-download");
        break;
      case CONFIGURE_CMAKE_PROJECT_LABEL:
        // alt. "gather"
        element.iconPath = new ThemeIcon("beaker");
        break;
      case CLEAN_CMAKE_PROJECT_LABEL:
        // or "trash" or "sync"
        element.iconPath = new ThemeIcon("squirrel");
        break;
      case SWITCH_BUILD_TYPE_LABEL:
        element.iconPath = new ThemeIcon("gear");
        element.description = `${this._buildType}`;
        break;
      case SWITCH_SDK_LABEL:
        // repo-forked or extensions; alt. "replace-all"
        element.iconPath = new ThemeIcon("find-replace-all");
        element.description = `${this._sdkVersion}`;
        break;
      case SWITCH_BOARD_LABEL:
        element.iconPath = new ThemeIcon("circuit-board");
        element.description = `${this._board}`;
        break;
      case DEBUG_LAYOUT_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("debug-console");
        break;

      case DOCUMENTATION_LABEL_BY_ID[DocumentationId.hardware]:
        element.iconPath = new ThemeIcon("device-camera");
        break;
      case DOCUMENTATION_LABEL_BY_ID[DocumentationId.highLevel]:
        element.iconPath = new ThemeIcon("device-camera-video");
        break;
      case DOCUMENTATION_LABEL_BY_ID[DocumentationId.networking]:
        element.iconPath = new ThemeIcon("server");
        break;
      case DOCUMENTATION_LABEL_BY_ID[DocumentationId.runtimeInfrastructure]:
        element.iconPath = new ThemeIcon("server-process");
        break;
    }

    return element;
  }

  public getChildren(element?: QuickAccessCommand): QuickAccessCommand[] {
    if (element === undefined) {
      return [
        new QuickAccessCommand(
          COMMON_COMMANDS_PARENT_LABEL,
          TreeItemCollapsibleState.Expanded
        ),
        new QuickAccessCommand(
          PROJECT_COMMANDS_PARENT_LABEL,
          TreeItemCollapsibleState.Expanded
        ),
        new QuickAccessCommand(
          DOCUMENTATION_COMMANDS_PARENT_LABEL,
          TreeItemCollapsibleState.Expanded
        ),
      ];
    } else if (element.label === COMMON_COMMANDS_PARENT_LABEL) {
      return [
        new QuickAccessCommand(
          NEW_C_CPP_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NEW_PROJECT}`,
            title: NEW_C_CPP_PROJECT_LABEL,
            arguments: [ProjectLang.cCpp],
          }
        ),
        new QuickAccessCommand(
          NEW_MICROPYTHON_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NEW_PROJECT}`,
            title: NEW_MICROPYTHON_PROJECT_LABEL,
            arguments: [ProjectLang.micropython],
          }
        ),
        new QuickAccessCommand(
          NEW_RUST_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NEW_PROJECT}`,
            title: NEW_RUST_PROJECT_LABEL,
            arguments: [ProjectLang.rust],
          }
        ),
        new QuickAccessCommand(
          NEW_ZEPHYR_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NEW_PROJECT}`,
            title: NEW_ZEPHYR_PROJECT_LABEL,
            arguments: [ProjectLang.zephyr],
          }
        ),
        new QuickAccessCommand(
          IMPORT_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${IMPORT_PROJECT}`,
            title: IMPORT_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          EXAMPLE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NEW_EXAMPLE_PROJECT}`,
            title: EXAMPLE_PROJECT_LABEL,
            arguments: [true],
          }
        ),
        new QuickAccessCommand(
          MANAGE_COMPONENTS_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OPEN_UNINSTALLER}`,
            title: MANAGE_COMPONENTS_LABEL,
          }
        ),
      ];
    } else if (element.label === PROJECT_COMMANDS_PARENT_LABEL) {
      return [
        new QuickAccessCommand(
          DEBUG_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${CONDITIONAL_DEBUGGING}`,
            title: DEBUG_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          COMPILE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${COMPILE_PROJECT}`,
            title: COMPILE_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          RUN_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${RUN_PROJECT}`,
            title: RUN_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          FLASH_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${FLASH_PROJECT_SWD}`,
            title: FLASH_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          CONFIGURE_CMAKE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${CONFIGURE_CMAKE}`,
            title: CONFIGURE_CMAKE_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          CLEAN_CMAKE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${CLEAN_CMAKE}`,
            title: CLEAN_CMAKE_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          SWITCH_BUILD_TYPE_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${SWITCH_BUILD_TYPE}`,
            title: SWITCH_BUILD_TYPE_LABEL,
          }
        ),
        new QuickAccessCommand(
          SWITCH_SDK_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${SWITCH_SDK}`,
            title: SWITCH_SDK_LABEL,
          }
        ),
        new QuickAccessCommand(
          SWITCH_BOARD_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${SWITCH_BOARD}`,
            title: SWITCH_BOARD_LABEL,
          }
        ),
        new QuickAccessCommand(
          DEBUG_LAYOUT_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${DEBUG_LAYOUT}`,
            title: DEBUG_LAYOUT_PROJECT_LABEL,
          }
        ),
      ];
    } else if (element.label === DOCUMENTATION_COMMANDS_PARENT_LABEL) {
      return [
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.hardware],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OPEN_SDK_DOCUMENTATION}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.hardware],
            arguments: [DocumentationId.hardware],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.highLevel],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OPEN_SDK_DOCUMENTATION}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.highLevel],
            arguments: [DocumentationId.highLevel],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.networking],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OPEN_SDK_DOCUMENTATION}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.networking],
            arguments: [DocumentationId.networking],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.runtimeInfrastructure],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OPEN_SDK_DOCUMENTATION}`,
            title:
              DOCUMENTATION_LABEL_BY_ID[DocumentationId.runtimeInfrastructure],
            arguments: [DocumentationId.runtimeInfrastructure],
          }
        ),
      ];
    } else {
      return [];
    }
  }
}
