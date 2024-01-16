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
import type UI from "../ui.mjs";
import ConditionalDebuggingCommand from "../commands/conditionalDebugging.mjs";

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

const NEW_PROJECT_LABEL = "New Project";
const SWITCH_SDK_LABEL = "Switch SDK";
const COMPILE_PROJECT_LABEL = "Compile Project";
const DEBUG_PROJECT_LABEL = "Debug Project";

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

      case DEBUG_PROJECT_LABEL:
        element.iconPath = new ThemeIcon("debug-alt");
        break;
      case COMPILE_PROJECT_LABEL:
        // alt. "gear"
        element.iconPath = new ThemeIcon("notifications-configure");
        break;
      case SWITCH_SDK_LABEL:
        // repo-forked or extensions; alt. "replace-all"
        element.iconPath = new ThemeIcon("find-replace-all");
        element.description = `Current: ${this._sdkVersion}`;
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
          SWITCH_SDK_LABEL,
          TreeItemCollapsibleState.None,
          {
            command: `${extensionName}.${SwitchSDKCommand.id}`,
            title: SWITCH_SDK_LABEL,
          }
        ),
      ];
    } else {
      return [];
    }
  }
}
