import { CommandWithArgs } from "./command.mjs";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";
import { IMPORT_PROJECT } from "./cmdIds.mjs";

export default class ImportProjectCommand extends CommandWithArgs {
  constructor(private readonly _extensionUri: Uri) {
    super(IMPORT_PROJECT);
  }

  execute(projectUri?: Uri): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._extensionUri, true, false, projectUri);
  }
}
