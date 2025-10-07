import type { Uri } from "vscode";
import { Command } from "./command.mjs";
import { OPEN_UNINSTALLER } from "./cmdIds.mjs";
import { UninstallerPanel } from "../webview/uninstallerPanel.mjs";

export default class OpenUninstallerCommand extends Command {
  private readonly _extensionUri: Uri;

  constructor(extensionUri: Uri) {
    super(OPEN_UNINSTALLER);

    this._extensionUri = extensionUri;
  }

  execute(): void {
    UninstallerPanel.createOrShow(this._extensionUri);
  }
}
