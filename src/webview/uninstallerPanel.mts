/* eslint-disable max-len */
import {
  ColorThemeKind,
  commands,
  Uri,
  ViewColumn,
  type Webview,
  type WebviewPanel,
  window,
  workspace,
  type Disposable,
} from "vscode";
import Settings from "../settings.mjs";
import Logger from "../logger.mjs";
import { getNonce, getWebviewOptions } from "./sharedFunctions.mjs";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import type { DependencyItem } from "./sharedEnums.mjs";
import LastUsedDepsStore from "../utils/lastUsedDeps.mjs";
import { ALL_DEPS, type DepVersionDb } from "../models/dependency.mjs";
import { uninstallOne } from "../utils/uninstallUtil.mjs";

export class UninstallerPanel {
  public static currentPanel: UninstallerPanel | undefined;

  public static readonly viewType = "uninstaller";

  private readonly _panel: WebviewPanel;
  private readonly _extensionUri: Uri;
  private readonly _settings: Settings;
  private readonly _logger: Logger = new Logger("UninstallerPanel");
  private _disposables: Disposable[] = [];

  private readonly _lastUsed: LastUsedDepsStore;

  public static createOrShow(extensionUri: Uri): void {
    const column = window.activeTextEditor
      ? window.activeTextEditor.viewColumn
      : undefined;

    if (UninstallerPanel.currentPanel) {
      UninstallerPanel.currentPanel._panel.reveal(column);

      return;
    }

    const panel = window.createWebviewPanel(
      UninstallerPanel.viewType,
      "Manage Installed Components",
      column || ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    const settings = Settings.getInstance();
    if (!settings) {
      panel.dispose();

      void window
        .showErrorMessage(
          "Failed to load settings. Please restart VS Code " +
            "or reload the window.",
          "Reload Window"
        )
        .then(selected => {
          if (selected === "Reload Window") {
            void commands.executeCommand("workbench.action.reloadWindow");
          }
        });

      return;
    }

    UninstallerPanel.currentPanel = new UninstallerPanel(
      panel,
      settings,
      extensionUri
    );
  }

  public static revive(panel: WebviewPanel, extensionUri: Uri): void {
    const settings = Settings.getInstance();
    if (settings === undefined) {
      // TODO: maybe add restart button
      void window.showErrorMessage(
        "Failed to load settings. Please restart VSCode."
      );

      return;
    }

    UninstallerPanel.currentPanel = new UninstallerPanel(
      panel,
      settings,
      extensionUri
    );
  }

  private constructor(
    panel: WebviewPanel,
    settings: Settings,
    extensionUri: Uri
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._settings = settings;
    this._lastUsed = LastUsedDepsStore.instance;

    void this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      async () => {
        if (this._panel.visible) {
          await this._update();
        }
      },
      null,
      this._disposables
    );

    workspace.onDidChangeConfiguration(
      async () => {
        await this._updateTheme();
      },
      null,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      async (message: { type: string; ids: string[] }) => {
        switch (message.type) {
          case "ready": {
            const installedMap = await this.getInstalledItems();
            this._panel.webview.postMessage({
              type: "init",
              items: installedMap,
            });
            break;
          }

          case "uninstall": {
            const ids: string[] = Array.isArray(message.ids) ? message.ids : [];
            const removed: string[] = [];
            try {
              for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                const [depId, versionKey] = id.split("@@");
                const version = versionKey === "__" ? undefined : versionKey;

                this._panel.webview.postMessage({
                  type: "uninstall:progress",
                  text: `Uninstalling ${depId} ${version ?? ""} (${i + 1}/${
                    ids.length
                  })…`,
                });

                await uninstallOne(depId, version);
                removed.push(id);
              }
              await this._panel.webview.postMessage({
                type: "uninstall:done",
                ids: removed,
              });
            } catch (err) {
              await this._panel.webview.postMessage({
                type: "uninstall:error",
                error: unknownErrorToString(err),
              });
            }
            break;
          }
        }
      }
    );
  }

  private async _update(): Promise<void> {
    this._panel.title = "Manage Installed Components";

    this._panel.iconPath = Uri.joinPath(
      this._extensionUri,
      "web",
      "raspberry-128.png"
    );
    const html = this._getHtmlForWebview(this._panel.webview);

    if (html !== "") {
      try {
        this._panel.webview.html = html;
      } catch (error) {
        this._logger.error(
          "Failed to set webview html. Webview might " +
            "have been disposed. Error: ",
          unknownErrorToString(error)
        );
        // properly dispose panel
        this.dispose();

        return;
      }
      await this._updateTheme();
    } else {
      void window.showErrorMessage(
        "Failed to load webview for the Uninstaller."
      );
      this.dispose();
    }
  }

  private async _updateTheme(): Promise<void> {
    try {
      await this._panel.webview.postMessage({
        command: "setTheme",
        theme:
          window.activeColorTheme.kind === ColorThemeKind.Dark ||
          window.activeColorTheme.kind === ColorThemeKind.HighContrast
            ? "dark"
            : "light",
      });
    } catch (error) {
      this._logger.error(
        "Failed to update theme in webview. Webview " +
          "might have been disposed. Error:",
        unknownErrorToString(error)
      );
      // properly dispose panel
      this.dispose();
    }
  }

  public dispose(): void {
    UninstallerPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();

      if (x) {
        x.dispose();
      }
    }
  }

  private async getInstalledItems(): Promise<DependencyItem[]> {
    const installedItems = await this._lastUsed.getAll(true, true);
    const installedAtItems = this._lastUsed.getAllInstalledDates();

    return flattenInstalled(installedItems, installedAtItems);
  }

  private _getHtmlForWebview(webview: Webview): string {
    const mainScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "uninstaller", "main.js")
    );

    const mainStyleUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "uninstaller", "main.css")
    );

    const tailwindcssScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "tailwindcss-3_3_5.js")
    );

    // Restrict the webview to only load specific scripts
    const nonce = getNonce();

    const defaultTheme =
      window.activeColorTheme.kind === ColorThemeKind.Dark ||
      window.activeColorTheme.kind === ColorThemeKind.HighContrast
        ? "dark"
        : "light";

    return `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
              webview.cspSource
            } 'unsafe-inline'; img-src ${
      webview.cspSource
    } https:; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
            <link href="${mainStyleUri.toString()}" rel="stylesheet">
    
            <title>Pico SDK Uninstaller</title>
    
            <script nonce="${nonce}" src="${tailwindcssScriptUri.toString()}"></script>
            <script nonce="${nonce}">
              tailwind.config = {
                darkMode: 'class',
              };
    
              localStorage.theme = "${defaultTheme}";
    
            </script>
          </head>
          <body class="h-screen w-screen overflow-x-hidden overflow-y-hidden${
            defaultTheme === "dark" ? " dark" : ""
          }">
              <script nonce="${nonce}" src="${mainScriptUri.toString()}"></script>
          </body>
        </html>
        `;
  }
}

function generatePath(depId: string, version: string): string | undefined {
  // TODO: use INSTALL_ROOT_ALIAS
  switch (depId) {
    case "pico-sdk":
    case "ninja":
    case "cmake":
    case "openocd":
    case "git":
    case "picotool":
      return `~/.pico-sdk/${depId}/${version}`;
    case "arm-toolchain":
    case "riscv-toolchain":
      return `~/.pico-sdk/toolchain/${version}`;
    case "embedded-python":
      return `~/.pico-sdk/python/${version}`;
    case "7zip":
      return `~/.pico-sdk/7zip`;
    case "pico-sdk-tools":
      return `~/.pico-sdk/tools/${version}`;
    case "zephyr":
      return `~/.pico-sdk/zephyr_workspace/zephyr-${version}`;
    default:
      return undefined;
  }
}

function flattenInstalled(
  installedMap: DepVersionDb,
  installedAtMap: DepVersionDb
): DependencyItem[] {
  // installedMap: { depId: { versionKey: "YYYY-MM-DD" } }
  // Provide labels from metadata
  const labelFor = (id: string): string =>
    ALL_DEPS.find(d => d.id === id)?.label ?? id;
  const items: DependencyItem[] = [];
  for (const [depId, versions] of Object.entries(installedMap)) {
    for (const [verKey, lastUsed] of Object.entries(versions)) {
      const version = verKey === "__" ? "latest" : verKey;
      // TODO: maybe improve
      const installedAt = Object.entries(installedAtMap).find(
        ([d, v]) => d === depId && v[verKey] !== undefined
      );

      items.push({
        id: `${depId}@@${version || "__"}`,
        depId,
        label: labelFor(depId),
        version,
        lastUsed,
        path: generatePath(`${depId}`, version),
        installedAt: installedAt ? installedAt[1][verKey] : "1970-01-01",
      });
    }
  }

  return items;
}
