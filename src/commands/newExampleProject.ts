import { Command } from "./command";
import Logger from "../logger";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel";

export default class NewExampleProjectCommand extends Command {
  private _logger: Logger = new Logger("NewExampleProjectCommand");

  public static readonly id = "newExampleProject";

  constructor(private readonly _extensionUri: Uri) {
    super(NewExampleProjectCommand.id);
  }

  execute(): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._extensionUri, false, true);
  }
}
