import { Command } from "./command";
import Logger from "../logger";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel";

export default class NewProjectCommand extends Command {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  private readonly _extensionUri: Uri;

  public static readonly id = "newProject";

  constructor(extensionUri: Uri) {
    super(NewProjectCommand.id);

    this._extensionUri = extensionUri;
  }

  execute(): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._extensionUri);
  }
}
