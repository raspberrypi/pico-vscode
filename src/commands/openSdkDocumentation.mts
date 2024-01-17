/* eslint-disable max-len */
import { CommandWithArgs } from "./command.mjs";
import Logger from "../logger.mjs";
import { type QuickPickItem, ViewColumn, window, Uri } from "vscode";
import { readFileSync } from "fs";

export enum DocumentationId {
  hardware = 0,
  highLevel = 1,
  networking = 2,
  runtimeInfrastructure = 3,
}

export const DOCUMENTATION_LABEL_BY_ID: string[] = [
  "Hardware APIs",
  "High Level APIs",
  "Networking Libraries",
  "Runtime Infrastructure",
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DOCUMENTATION_URLS_BY_ID: string[] = [
  //"https://raspberrypi.github.io/pico-sdk-doxygen/index.html",
  "https://www.raspberrypi.com/documentation/pico-sdk/hardware.html",
  "https://www.raspberrypi.com/documentation/pico-sdk/high_level.html",
  "https://www.raspberrypi.com/documentation/pico-sdk/networking.html",
  "https://www.raspberrypi.com/documentation/pico-sdk/runtime.html",
];

const LOCAL_DOCUMENTATION_URLS_BY_ID: string[] = [
  "hardware.html",
  "high_level.html",
  "networking.html",
  "runtime.html",
];

export default class OpenSdkDocumentationCommand extends CommandWithArgs {
  private _logger: Logger = new Logger("OpenSdkDocumentationCommand");

  public static readonly id = "openSdkDocumentation";

  constructor(private readonly _extensionUri: Uri) {
    super(OpenSdkDocumentationCommand.id);
  }

  async execute(docId?: DocumentationId): Promise<void> {
    let url = docId !== undefined ? LOCAL_DOCUMENTATION_URLS_BY_ID[docId] : "";
    if (docId === undefined) {
      const options: QuickPickItem[] = DOCUMENTATION_LABEL_BY_ID.map(
        (label, index) => ({
          label,
          detail: LOCAL_DOCUMENTATION_URLS_BY_ID[index],
        })
      );

      const result = await window.showQuickPick(options, {
        placeHolder: "Select Category",
        canPickMany: false,
        ignoreFocusOut: false,
      });

      if (result === undefined || result.detail === undefined) {
        return;
      }

      url = result.detail;
    }

    // show webview
    this._logger.info("Opening SDK documentation in browser...");
    const panel = window.createWebviewPanel(
      "pico-sdk-documentation",
      "Pico SDK Documentation",
      { viewColumn: ViewColumn.Two, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
        localResourceRoots: [Uri.joinPath(this._extensionUri, "web", "docs")],
        enableCommandUris: false,
      }
    );

    panel.webview.html = this._getHtmlForWebview(
      Uri.joinPath(this._extensionUri, "web", "docs", url).fsPath,
      panel.webview
        .asWebviewUri(
          Uri.joinPath(this._extensionUri, "web", "docs", "docstyle.css")
        )
        .toString(),
      panel.webview.cspSource
    );
    panel.reveal();
  }

  private _getHtmlForWebview(
    url: string,
    docstyle: string,
    cspSource: string
  ): string {
    const regex = /<a\s+(.*?)\s?href=".+(#[^"]+)"/g;

    // load from file
    return (
      readFileSync(url)
        .toString("utf-8")
        .replace(/{{docstyle}}/g, docstyle)
        /*.replace(/{{jquery}}/g, jquery)
      .replace(/{{jquery-ui}}/g, jqueryUi)
      .replace(/{{jquery-tocify}}/g, jqueryTocify)
      .replace(/{{nonce}}/g, nonce)*/
        .replace(/{{cspSource}}/g, cspSource)
        .replace(regex, '<a $1 href="$2"')
    );
  }
}
