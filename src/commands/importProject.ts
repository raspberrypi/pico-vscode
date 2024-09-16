import { CommandWithArgs } from "./command";
import Logger from "../logger";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel";

export default class ImportProjectCommand extends CommandWithArgs {
  private _logger: Logger = new Logger("ImportProjectCommand");

  public static readonly id = "importProject";

  constructor(private readonly _extensionUri: Uri) {
    super(ImportProjectCommand.id);
  }

  execute(projectUri?: Uri): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._extensionUri, true, false, projectUri);
  }
}
