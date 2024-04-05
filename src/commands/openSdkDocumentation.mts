/* eslint-disable max-len */
import { CommandWithArgs } from "./command.mjs";
import Logger from "../logger.mjs";
import {
  type QuickPickItem,
  ViewColumn,
  window,
  Uri,
  type WebviewPanel,
} from "vscode";
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
  "group__hardware.html",
  "group__high__level.html",
  "group__networking.html",
  "group__runtime.html",
];

export default class OpenSdkDocumentationCommand extends CommandWithArgs {
  private _logger: Logger = new Logger("OpenSdkDocumentationCommand");

  public static readonly id = "openSdkDocumentation";
  private _panel: WebviewPanel | undefined = undefined;

  constructor(private readonly _extensionUri: Uri) {
    super(OpenSdkDocumentationCommand.id);
  }

  async execute(docId?: DocumentationId, fileName?: string): Promise<void> {
    let url = "";
    if (typeof docId === "number") {
      url = docId !== undefined ? LOCAL_DOCUMENTATION_URLS_BY_ID[docId] : "";
    } else if (fileName !== undefined) {
      url = fileName;
    } else {
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
    if (this._panel === undefined) {
      Logger.log("New panel");
      this._panel = window.createWebviewPanel(
        "pico-sdk-documentation",
        "Pico SDK Documentation",
        { viewColumn: ViewColumn.Two, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          enableFindWidget: true,
          localResourceRoots: [Uri.joinPath(this._extensionUri, "web", "docs")],
          enableCommandUris: true,
        }
      );
    }

    const panel = this._panel;

    panel.webview.html = this._getHtmlForWebview(
      Uri.joinPath(this._extensionUri, "web", "docs", url).fsPath,
      panel.webview.cspSource,
      panel,
      this._extensionUri
    );
    panel.reveal();

    // dispose when hidden
    panel.onDidDispose(() => {
      this._panel = undefined;
    }, this);
  }

  private _getHtmlForWebview(
    url: string,
    cspSource: string,
    panel: WebviewPanel,
    extensionUri: Uri
  ): string {
    const regexa = /<a\s+(.*?)?href="([^"]+)"/g;
    const regexsrc = /src="([^"]+)"/g;
    const regexcss = /<link href="([^"]+)" rel="stylesheet"/g;

    // load from file
    return (
      readFileSync(url)
        .toString("utf-8")
        /*.replace(/{{jquery}}/g, jquery)
      .replace(/{{jquery-ui}}/g, jqueryUi)
      .replace(/{{jquery-tocify}}/g, jqueryTocify)
      .replace(/{{nonce}}/g, nonce)*/
        .replace(/{{cspSource}}/g, cspSource)
        .replace(regexa, function (match, space: string, file: string) {
          if (file === "/") {
            file = "index.html";
          }
          if (space === undefined) {
            space = "";
          }
          if (file.match("#") || file.match("https")) {
            if (file.match("#")) {
              file = `#${file.split("#")[1]}`;
            }
            const ret = `<a ${space}href="${file}"`;

            return ret;
          }
          const command = Uri.parse(
            `command:raspberry-pi-pico.openSdkDocumentation?${encodeURIComponent(
              JSON.stringify([undefined, file])
            )}`
          ).toString();
          const ret = `<a ${space}href="${command}"`;

          return ret;
        })
        .replace(regexsrc, function (match, file: string) {
          const ret = `src="${panel.webview
            .asWebviewUri(Uri.joinPath(extensionUri, "web", "docs", file))
            .toString()}"`;

          return ret;
        })
        .replace(regexcss, function (match, file: string) {
          const ret = `<link href="${panel.webview
            .asWebviewUri(Uri.joinPath(extensionUri, "web", "docs", file))
            .toString()}" rel="stylesheet"`;

          return ret;
        })
        .replace('<div class="navigation-toggle">', "<div hidden>")
        .replace('<div id="main-nav">', '<div id="main-nav" hidden>')
    );
  }
}
