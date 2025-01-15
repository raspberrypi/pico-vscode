/* eslint-disable max-len */
import type { Webview, Progress } from "vscode";
import {
  Uri,
  ViewColumn,
  window,
  type WebviewPanel,
  type Disposable,
  ColorThemeKind,
  workspace,
  ProgressLocation,
  commands,
} from "vscode";
import Settings from "../settings.mjs";
import Logger from "../logger.mjs";
import type { WebviewMessage } from "./newProjectPanel.mjs";
import {
  getNonce,
  getProjectFolderDialogOptions,
  getWebviewOptions,
} from "./newProjectPanel.mjs";
import which from "which";
import { existsSync } from "fs";
import { join } from "path";
import { PythonExtension } from "@vscode/python-extension";
import { unknownErrorToString } from "../utils/errorHelper.mjs";

interface SubmitMessageValue {
  projectName: string;
  pythonMode: number;
  pythonPath: string;
}

export class NewMicroPythonProjectPanel {
  public static currentPanel: NewMicroPythonProjectPanel | undefined;

  public static readonly viewType = "newPicoMicroPythonProject";

  private readonly _panel: WebviewPanel;
  private readonly _extensionUri: Uri;
  private readonly _settings: Settings;
  private readonly _logger: Logger = new Logger("NewMicroPythonProjectPanel");
  private _disposables: Disposable[] = [];

  private _projectRoot?: Uri;
  private _pythonExtensionApi?: PythonExtension;

  public static createOrShow(extensionUri: Uri, projectUri?: Uri): void {
    const column = window.activeTextEditor
      ? window.activeTextEditor.viewColumn
      : undefined;

    if (NewMicroPythonProjectPanel.currentPanel) {
      NewMicroPythonProjectPanel.currentPanel._panel.reveal(column);
      // update already exiting panel with new project root
      if (projectUri) {
        NewMicroPythonProjectPanel.currentPanel._projectRoot = projectUri;
        // update webview
        void NewMicroPythonProjectPanel.currentPanel._panel.webview.postMessage(
          {
            command: "changeLocation",
            value: projectUri?.fsPath,
          }
        );
      }

      return;
    }

    const panel = window.createWebviewPanel(
      NewMicroPythonProjectPanel.viewType,
      "New MicroPython Pico Project",
      column || ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    const settings = Settings.getInstance();
    if (!settings) {
      panel.dispose();

      void window
        .showErrorMessage(
          "Failed to load settings. Please restart VS Code or reload the window.",
          "Reload Window"
        )
        .then(selected => {
          if (selected === "Reload Window") {
            commands.executeCommand("workbench.action.reloadWindow");
          }
        });

      return;
    }

    NewMicroPythonProjectPanel.currentPanel = new NewMicroPythonProjectPanel(
      panel,
      settings,
      extensionUri,
      projectUri
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

    // TODO: reload if it was import panel maybe in state
    NewMicroPythonProjectPanel.currentPanel = new NewMicroPythonProjectPanel(
      panel,
      settings,
      extensionUri
    );
  }

  private constructor(
    panel: WebviewPanel,
    settings: Settings,
    extensionUri: Uri,
    projectUri?: Uri
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._settings = settings;

    this._projectRoot = projectUri ?? this._settings.getLastProjectRoot();

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
      async (message: WebviewMessage) => {
        switch (message.command) {
          case "changeLocation":
            {
              const newLoc = await window.showOpenDialog(
                getProjectFolderDialogOptions(this._projectRoot, false)
              );

              if (newLoc && newLoc[0]) {
                // overwrite preview folderUri
                this._projectRoot = newLoc[0];
                await this._settings.setLastProjectRoot(newLoc[0]);

                // update webview
                await this._panel.webview.postMessage({
                  command: "changeLocation",
                  value: newLoc[0].fsPath,
                });
              }
            }
            break;
          case "cancel":
            this.dispose();
            break;
          case "error":
            void window.showErrorMessage(message.value as string);
            break;
          case "submit":
            {
              const data = message.value as SubmitMessageValue;

              if (
                this._projectRoot === undefined ||
                this._projectRoot.fsPath === ""
              ) {
                void window.showErrorMessage(
                  "No project root selected. Please select a project root."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              if (
                data.projectName === undefined ||
                data.projectName.length === 0
              ) {
                void window.showWarningMessage(
                  "The project name is empty. Please enter a project name."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              // check if projectRoot/projectName folder already exists
              if (
                existsSync(join(this._projectRoot.fsPath, data.projectName))
              ) {
                void window.showErrorMessage(
                  "Project already exists. " +
                    "Please select a different project name or root."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              // close panel before generating project
              this.dispose();

              await window.withProgress(
                {
                  location: ProgressLocation.Notification,
                  title: `Generating MicroPico project ${
                    data.projectName ?? "undefined"
                  } in ${this._projectRoot?.fsPath}...`,
                },
                async progress =>
                  this._generateProjectOperation(progress, data, message)
              );
            }
            break;
        }
      },
      null,
      this._disposables
    );

    if (projectUri !== undefined) {
      // update webview
      void this._panel.webview.postMessage({
        command: "changeLocation",
        value: projectUri.fsPath,
      });
    }
  }

  private async _generateProjectOperation(
    progress: Progress<{ message?: string; increment?: number }>,
    data: SubmitMessageValue,
    message: WebviewMessage
  ): Promise<void> {
    const projectPath = this._projectRoot?.fsPath ?? "";

    if (
      typeof message.value !== "object" ||
      message.value === null ||
      projectPath.length === 0
    ) {
      void window.showErrorMessage(
        "Failed to generate MicroPython project. " +
          "Please try again and check your settings."
      );

      return;
    }

    // install python (if necessary)
    let python3Path: string | undefined;
    if (process.platform === "darwin" || process.platform === "win32") {
      switch (data.pythonMode) {
        case 0:
          python3Path = data.pythonPath;
          break;
        case 1:
          python3Path = process.platform === "win32" ? "python" : "python3";
          break;
        case 2:
          python3Path = data.pythonPath;
          break;
      }

      if (python3Path === undefined) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        await window.showErrorMessage("Failed to find python3 executable.");

        return;
      }
    } else {
      python3Path = "python3";
    }

    // create the folder with project name in project root
    // open the folder in vscode and call micropico.initialise

    // create the project folder
    const projectFolder = join(projectPath, data.projectName);
    progress.report({
      message: `Creating project folder ${projectFolder}`,
      increment: 10,
    });

    try {
      await workspace.fs.createDirectory(Uri.file(projectFolder));
      // also create a blink.py in it with a import machine
      const blinkPyCode = `from machine import Pin
from utime import sleep

pin = Pin("LED", Pin.OUT)

print("LED starts flashing...")
while True:
    try:
        pin.toggle()
        sleep(1) # sleep 1sec
    except KeyboardInterrupt:
        break
pin.off()
print("Finished.")\r\n`;
      const filePath = join(projectFolder, "blink.py");
      await workspace.fs.writeFile(
        Uri.file(filePath),
        new TextEncoder().encode(blinkPyCode)
      );
    } catch {
      progress.report({
        message: "Failed",
        increment: 100,
      });
      await window.showErrorMessage(
        `Failed to create project folder ${projectFolder}`
      );

      return;
    }

    commands.executeCommand("micropico.initialise", projectFolder, python3Path);
    progress.report({
      message: "Project initialized",
      increment: 90,
    });

    // wait 2 seconds to give user option to read notifications
    await new Promise(resolve => setTimeout(resolve, 2000));

    // open and call initialise
    void commands.executeCommand("vscode.openFolder", Uri.file(projectFolder), {
      forceNewWindow: (workspace.workspaceFolders?.length ?? 0) > 0,
    });
  }

  private async _update(): Promise<void> {
    this._panel.title = "New MicroPython Pico Project";

    this._panel.iconPath = Uri.joinPath(
      this._extensionUri,
      "web",
      "raspberry-128.png"
    );
    if (!this._pythonExtensionApi) {
      this._pythonExtensionApi = await PythonExtension.api();
    }
    const html = await this._getHtmlForWebview(this._panel.webview);

    if (html !== "") {
      try {
        this._panel.webview.html = html;
      } catch (error) {
        this._logger.error(
          "Failed to set webview html. Webview might have been disposed. Error: ",
          unknownErrorToString(error)
        );
        // properly dispose panel
        this.dispose();

        return;
      }
      await this._updateTheme();
    } else {
      void window.showErrorMessage(
        "Failed to load webview for new MicroPython project"
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
        "Failed to update theme in webview. Webview might have been disposed. Error:",
        unknownErrorToString(error)
      );
      // properly dispose panel
      this.dispose();
    }
  }

  public dispose(): void {
    NewMicroPythonProjectPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();

      if (x) {
        x.dispose();
      }
    }
  }

  private async _getHtmlForWebview(webview: Webview): Promise<string> {
    const mainScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "mpy", "main.js")
    );

    const mainStyleUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "main.css")
    );

    const tailwindcssScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "tailwindcss-3_3_5.js")
    );

    // images
    const navHeaderSvgUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "raspberrypi-nav-header.svg")
    );

    const navHeaderDarkSvgUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "raspberrypi-nav-header-dark.svg")
    );

    // TODO: add support for onDidChangeActiveEnvironment and filter envs that don't directly point
    // to an executable
    const environments = this._pythonExtensionApi?.environments;
    const knownEnvironments = environments?.known;
    const activeEnv = environments?.getActiveEnvironmentPath();

    // TODO: check python version, workaround, only allow python3 commands on unix
    const isPythonSystemAvailable =
      (await which("python3", { nothrow: true })) !== null ||
      (await which("python", { nothrow: true })) !== null;

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

        <title>New Pico MicroPython Project</title>

        <script nonce="${nonce}" src="${tailwindcssScriptUri.toString()}"></script>
        <script nonce="${nonce}">
          tailwind.config = {
            darkMode: 'class',
          };

          localStorage.theme = "${defaultTheme}";

        </script>
      </head>
      <body class="scroll-smooth w-screen${defaultTheme === "dark" ? " dark" : ""}">
        <div id="above-nav" class="container max-w-6xl mx-auto flex justify-between items-center w-full sticky top-0 z-10 pl-5 h-5">
        </div>
        <div id="nav-overlay" class="overlay hidden md:hidden inset-y-0 right-0 w-auto z-50 overflow-y-auto ease-out bg-slate-400 dark:bg-slate-800 drop-shadow-lg">
          <!-- Navigation links go here -->
          <ul class="overlay-menu">
            <li id="ov-nav-basic" class="overlay-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Basic Settings</li>
          </ul>
        </div>
        <nav id="top-navbar" class="container max-w-6xl mx-auto flex justify-between items-center w-full sticky top-5 z-10 pl-5 pr-5 h-24 bg-opacity-95 bg-slate-400 dark:bg-slate-800 rounded-md">
            <div class="inline-flex h-32 align-middle">
                <img src="${navHeaderSvgUri.toString()}" alt="raspberry pi logo" class="h-32 rounded cursor-not-allowed hidden dark:block mb-2"/>
                <img src="${navHeaderDarkSvgUri.toString()}" alt="raspberry pi logo" class="h-32 rounded cursor-not-allowed block dark:hidden mb-2"/>
            </div>
            <ul class="pl-3 pr-3 space-x-4 h-auto align-middle hidden md:flex">
                <li class="nav-item text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-basic">
                    Basic Settings
                </li>
            </ul>
            <div id="burger-menu" class="flex md:hidden cursor-pointer h-auto me-7">
              <div class="bar bg-black dark:bg-white"></div>
              <div class="bar bg-black dark:bg-white"></div>
              <div class="bar bg-black dark:bg-white"></div>
            </div>
        </nav>
        <main class="container max-w-3xl xl:max-w-5xl mx-auto relative top-14 snap-y mb-20">
          <div id="section-basic" class="snap-start">
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Basic Settings</h3>
              <div id="project-name-grid" class="grid gap-6 md:grid-cols-2">
                <div>
                  <label for="inp-project-name" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Name</label>
                  <div class="flex">
                    <div class="relative inline-flex w-full">
                        <input type="text" id="inp-project-name" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 invalid:border-pink-500 invalid:text-pink-600 focus:invalid:border-pink-500 focus:invalid:ring-pink-500" placeholder="Project name" required/>
                        <button id="project-name-dropdown-button" class="absolute inset-y-0 right-0 flex items-center px-2 border border-l-0 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-r-lg border-gray-300 dark:border-gray-600 hidden">&#9660;</button>
                    </div>
                  </div>

                  <p id="inp-project-name-error" class="mt-2 text-sm text-red-600 dark:text-red-500" hidden>
                      <span class="font-medium">Error</span> Please enter a valid project name.
                  </p>
                </div>

                <div class="ms-6">
                  <div class="col-span-2">
                    <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Python Version:</label>

                    ${
                      knownEnvironments && knownEnvironments.length > 0
                        ? `
                      <div class="flex items-center mb-2">
                        <input type="radio" id="python-radio-known" name="python-version-radio" value="0" class="mr-1 text-blue-500">
                        <label for="python-radio-known" class="text-gray-900 dark:text-white">From Python extension</label>
                        <!-- show a select dropdown with python environments -->
                        <select id="sel-pyenv-known" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                          ${knownEnvironments
                            .map(
                              env =>
                                `<option value="${env.path}" ${
                                  (activeEnv?.id ?? "") === env.id
                                    ? "selected"
                                    : ""
                                }>${env.path}</option>`
                            )
                            .join("")}
                        </select>
                      </div>
                    `
                        : ""
                    }

                    ${
                      process.platform === "darwin" ||
                      process.platform === "win32"
                        ? `
                    ${
                      isPythonSystemAvailable
                        ? `<div class="flex items-center mb-2" >
                            <input type="radio" id="python-radio-system-version" name="python-version-radio" value="1" class="mr-1 text-blue-500">
                            <label for="python-radio-system-version" class="text-gray-900 dark:text-white">Use system version</label>
                          </div>`
                        : ""
                    }

                    <div class="flex items-center mb-2">
                      <input type="radio" id="python-radio-path-executable" name="python-version-radio" value="2" class="mr-1 text-blue-500">
                      <label for="python-radio-path-executable" class="text-gray-900 dark:text-white">Path to executable:</label>
                      <input type="file" id="python-path-executable" multiple="false" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ms-2">
                    </div>`
                        : ""
                    }
                  </div>
                </div>

                <div class="mt-6 mb-4 col-span-2">
                    <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="file_input">Location</label>
                    <div class="flex">
                        <div class="w-full left-0 flex">
                            <span class="inline-flex items-center px-3 text-lg text-gray-900 bg-gray-200 border border-r-0 border-gray-300 rounded-l-md dark:bg-gray-600 dark:text-gray-400 dark:border-gray-600">
                            <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve" width="24" height="24">
                            <path style="fill:#027372;" d="M471.149,51.745L438.468,503.83h32.681c17.974,0,32.681-14.706,32.681-32.681V84.426L471.149,51.745z
                              "/>
                            <path style="fill:#02ACAB;" d="M471.149,51.745v419.404c0,17.974-14.706,32.681-32.681,32.681h-10.894L256,405.787L84.426,503.83
                              H40.851c-17.974,0-32.681-14.706-32.681-32.681V40.851C8.17,22.877,22.877,8.17,40.851,8.17h76.255L256,122.553L394.894,8.17h32.681
                              L471.149,51.745z"/>
                            <path style="fill:#D5F6F5;" d="M362.213,155.234V40.851h-65.362v114.383H362.213z"/>
                            <polygon style="fill:#ABECEC;" points="394.894,8.17 394.894,187.915 362.213,187.915 285.957,98.043 362.213,8.17 "/>
                            <polygon style="fill:#D5F6F5;" points="362.213,8.17 362.213,40.851 329.532,98.041 362.213,155.231 362.213,187.915 
                              117.106,187.915 117.106,8.17 "/>
                            <polygon style="fill:#EEEEEE;" points="427.574,329.532 427.574,503.83 394.894,503.83 340.426,285.957 "/>
                            <polygon style="fill:#FFFFFF;" points="394.894,285.957 394.894,503.83 84.426,503.83 84.426,329.532 "/>
                            <polygon style="fill:#4D4D4D;" points="362.213,40.851 362.213,155.234 340.426,155.234 318.638,98.043 340.426,40.851 "/>
                            <rect x="296.851" y="40.851" style="fill:#737373;" width="43.574" height="114.383"/>
                            <path style="fill:#FEA680;" d="M394.894,253.277h-32.681l32.681,76.255h32.681v-43.574
                              C427.574,267.983,412.868,253.277,394.894,253.277z"/>
                            <path style="fill:#FFC1A6;" d="M394.894,285.957v43.574H84.426v-43.574c0-17.974,14.706-32.681,32.681-32.681h245.106
                              C380.187,253.277,394.894,267.983,394.894,285.957z"/>
                            <path d="M509.607,78.648L433.351,2.392C431.82,0.861,429.741,0,427.574,0H40.851C18.325,0,0,18.325,0,40.851v430.298
                              C0,493.675,18.325,512,40.851,512h430.298C493.675,512,512,493.675,512,471.149V84.426C512,82.259,511.139,80.181,509.607,78.648z
                              M125.277,16.34h261.447v163.404H125.277V16.34z M495.66,471.149c0,13.515-10.995,24.511-24.511,24.511H40.851
                              c-13.516,0-24.511-10.996-24.511-24.511V40.851c0-13.515,10.995-24.511,24.511-24.511h68.085v171.574c0,4.513,3.658,8.17,8.17,8.17
                              h277.787c4.512,0,8.17-3.657,8.17-8.17V16.34h21.127l71.469,71.469V471.149z"/>
                            <path d="M362.213,32.681h-65.362c-4.512,0-8.17,3.657-8.17,8.17v114.383c0,4.513,3.658,8.17,8.17,8.17h65.362
                              c4.512,0,8.17-3.657,8.17-8.17V40.851C370.383,36.338,366.725,32.681,362.213,32.681z M354.043,147.064h-49.021V49.021h49.021
                              V147.064z"/>
                            <path d="M394.894,245.106H117.106c-22.526,0-40.851,18.325-40.851,40.851v185.191c0,4.513,3.658,8.17,8.17,8.17
                              s8.17-3.657,8.17-8.17V337.702h57.191c4.512,0,8.17-3.657,8.17-8.17c0-4.513-3.658-8.17-8.17-8.17H92.596v-35.404
                              c0-13.515,10.995-24.511,24.511-24.511h277.787c13.516,0,24.511,10.996,24.511,24.511v35.404H182.468c-4.512,0-8.17,3.657-8.17,8.17
                              c0,4.513,3.658,8.17,8.17,8.17h236.936v133.447c0,4.513,3.658,8.17,8.17,8.17c4.512,0,8.17-3.657,8.17-8.17V285.957
                              C435.745,263.432,417.419,245.106,394.894,245.106z"/>
                            <path d="M340.426,386.723H171.574c-4.512,0-8.17,3.657-8.17,8.17c0,4.513,3.658,8.17,8.17,8.17h168.851
                              c4.512,0,8.17-3.657,8.17-8.17C348.596,390.38,344.938,386.723,340.426,386.723z"/>
                            <path d="M284.141,430.298H171.574c-4.512,0-8.17,3.657-8.17,8.17c0,4.513,3.658,8.17,8.17,8.17h112.567
                              c4.512,0,8.17-3.657,8.17-8.17C292.312,433.955,288.655,430.298,284.141,430.298z"/>
                            </svg>
                            </span>
                            <input type="text" id="inp-project-location" class="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-500 dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="${
                              process.platform === "win32"
                                ? "C:\\MyProject"
                                : "/home/user/MyProject"
                            }" disabled value="${
      // support folder names with backslashes on linux and macOS
      this._projectRoot !== undefined
        ? process.platform === "win32"
          ? this._projectRoot.fsPath.replaceAll("\\", "/")
          : this._projectRoot.fsPath
        : ""
    }"/>
                        </div>
                        <button 
                            id="btn-change-project-location"
                            type="button"
                            class="relative inline-flex items-center justify-center standard-button-size p-1 ml-4 overflow-hidden text-sm font-medium text-gray-900 rounded-lg group bg-gradient-to-br from-pink-500 to-orange-400 group-hover:from-pink-500 group-hover:to-orange-400 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-pink-200 dark:focus:ring-pink-800">
                            <span class="relative px-4 py-2 transition-all ease-in duration-75 bg-white dark:bg-gray-900 rounded-md group-hover:bg-opacity-0">
                                Change
                            </span>
                        </button>
                    </div>
                </div>
          </div>

          <div class="bottom-3 mt-8 mb-12 w-full flex justify-end">
              <button id="btn-cancel" class="focus:outline-none bg-transparent ring-2 focus:ring-4 ring-red-400 dark:ring-red-700 font-medium rounded-lg text-lg px-4 py-2 mr-4 hover:bg-red-500 dark:hover:bg-red-700 focus:ring-red-600 dark:focus:ring-red-800">Cancel</button>
              <button id="btn-create" class="focus:outline-none bg-transparent ring-2 focus:ring-4 ring-green-400 dark:ring-green-700 font-medium rounded-lg text-lg px-4 py-2 mr-2 hover:bg-green-500 dark:hover:bg-green-700 focus:ring-green-600 dark:focus:ring-green-800">
                Create
              </button>
          </div>
        </main>

        <script nonce="${nonce}" src="${mainScriptUri.toString()}"></script>
      </body>
    </html>`;
  }
}
