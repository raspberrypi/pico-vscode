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
import NewProjectCommand from "../commands/newProject.mjs";
import CompileProjectCommand from "../commands/compileProject.mjs";
import SwitchSDKCommand from "../commands/switchSDK.mjs";
import ConditionalDebuggingCommand from "../commands/conditionalDebugging.mjs";
import DebugLayoutCommand from "../commands/debugLayout.mjs";
import OpenSdkDocumentationCommand, {
  DOCUMENTATION_LABEL_BY_ID,
  DocumentationId,
} from "../commands/openSdkDocumentation.mjs";
import ConfigureCmakeCommand from "../commands/configureCmake.mjs";
import ImportProjectCommand from "../commands/importProject.mjs";
import NewExampleProjectCommand from "../commands/newExampleProject.mjs";

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

const NEW_PROJECT_LABEL = "New Project";
const IMPORT_PROJECT_LABEL = "Import Project";
const EXAMPLE_PROJECT_LABEL = "New Example Project";
const SWITCH_SDK_LABEL = "Switch SDK";
const COMPILE_PROJECT_LABEL = "Compile Project";
const CONFIGURE_CMAKE_PROJECT_LABEL = "Configure CMake";
const DEBUG_PROJECT_LABEL = "Debug Project";
const DEBUG_LAYOUT_PROJECT_LABEL = "Debug Layout";

export class PicoProjectActivityBar
  implements TreeDataProvider<QuickAccessCommand>
{
  public static readonly viewType = "raspberry-pi-pico-project-quick-access";
  private _sdkVersion: string = "N/A";

  private _onDidChangeTreeData = new EventEmitter<
    QuickAccessCommand | undefined | void
  >();
  readonly onDidChangeTreeData: Event<QuickAccessCommand | undefined | void> =
    this._onDidChangeTreeData.event;

  private _logger: Logger = new Logger("PicoProjectActivityBar");

  constructor() {}

  public refresh(newPicoSDKVersion?: string): void {
    if (newPicoSDKVersion) {
      this._sdkVersion = newPicoSDKVersion;
    }
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(
    element: QuickAccessCommand
  ): TreeItem | Thenable<TreeItem> {
    switch (element.label) {
      case NEW_PROJECT_LABEL:
        // alt. "new-folder"
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

      case DEBUG_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("debug-alt");
        break;
      case COMPILE_PROJECT_LABEL:
        // alt. "gear", "notifications-configure"
        element.iconPath = new ThemeIcon("file-binary");
        break;
      case CONFIGURE_CMAKE_PROJECT_LABEL:
        // alt. "gather"
        element.iconPath = new ThemeIcon("beaker");
        break;
      case SWITCH_SDK_LABEL:
        // repo-forked or extensions; alt. "replace-all"
        element.iconPath = new ThemeIcon("find-replace-all");
        element.description = `Current: ${this._sdkVersion}`;
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

  public getChildren(
    element?: QuickAccessCommand | undefined
  ): QuickAccessCommand[] {
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
          NEW_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NewProjectCommand.id}`,
            title: NEW_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          IMPORT_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${ImportProjectCommand.id}`,
            title: IMPORT_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          EXAMPLE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${NewExampleProjectCommand.id}`,
            title: EXAMPLE_PROJECT_LABEL,
            arguments: [true],
          }
        ),
      ];
    } else if (element.label === PROJECT_COMMANDS_PARENT_LABEL) {
      return [
        new QuickAccessCommand(
          DEBUG_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${ConditionalDebuggingCommand.id}`,
            title: DEBUG_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          COMPILE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${CompileProjectCommand.id}`,
            title: COMPILE_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          CONFIGURE_CMAKE_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${ConfigureCmakeCommand.id}`,
            title: CONFIGURE_CMAKE_PROJECT_LABEL,
          }
        ),
        new QuickAccessCommand(
          SWITCH_SDK_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${SwitchSDKCommand.id}`,
            title: SWITCH_SDK_LABEL,
          }
        ),
        new QuickAccessCommand(
          DEBUG_LAYOUT_PROJECT_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${DebugLayoutCommand.id}`,
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
            command: `${extensionName}.${OpenSdkDocumentationCommand.id}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.hardware],
            arguments: [DocumentationId.hardware],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.highLevel],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OpenSdkDocumentationCommand.id}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.highLevel],
            arguments: [DocumentationId.highLevel],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.networking],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OpenSdkDocumentationCommand.id}`,
            title: DOCUMENTATION_LABEL_BY_ID[DocumentationId.networking],
            arguments: [DocumentationId.networking],
          }
        ),
        new QuickAccessCommand(
          DOCUMENTATION_LABEL_BY_ID[DocumentationId.runtimeInfrastructure],
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${OpenSdkDocumentationCommand.id}`,
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
