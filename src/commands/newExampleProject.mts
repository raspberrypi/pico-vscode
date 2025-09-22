import { Command } from "./command.mjs";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";
import { NEW_EXAMPLE_PROJECT } from "./cmdIds.mjs";

export default class NewExampleProjectCommand extends Command {
  constructor(private readonly _extensionUri: Uri) {
    super(NEW_EXAMPLE_PROJECT);
  }

  execute(): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._extensionUri, false, true);
  }
}
