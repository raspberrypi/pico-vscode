import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import type Settings from "../settings.mjs";
import { type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";

export default class NewProjectCommand extends Command {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  private readonly _settings: Settings;
  private readonly _extensionUri: Uri;

  constructor(settings: Settings, extensionUri: Uri) {
    super("newProject");

    this._settings = settings;
    this._extensionUri = extensionUri;
  }

  execute(): void {
    // show webview where the process of creating a new project is continued
    NewProjectPanel.createOrShow(this._settings, this._extensionUri);
  }
}
