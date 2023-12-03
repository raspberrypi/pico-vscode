/* eslint-disable max-len */
import {
  Uri,
  window,
  workspace,
  type WebviewOptions,
  type OpenDialogOptions,
  type WebviewPanel,
  type Disposable,
  ViewColumn,
  type Webview,
  commands,
  ColorThemeKind,
  ProgressLocation,
} from "vscode";
import { type ExecOptions, exec } from "child_process";
import { SettingsKey } from "../settings.mjs";
import type Settings from "../settings.mjs";
import Logger from "../logger.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  type SupportedToolchainVersion,
  getSupportedToolchains,
} from "../utils/toolchainUtil.mjs";
import {
  SDK_REPOSITORY_URL,
  getCmakeReleases,
  getNinjaReleases,
  getSDKReleases,
} from "../utils/githubREST.mjs";
import {
  buildCMakePath,
  buildNinjaPath,
  buildSDKPath,
  buildToolchainPath,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
} from "../utils/download.mjs";
import { compare } from "../utils/semverUtil.mjs";
import VersionBundlesLoader, {
  type VersionBundle,
} from "../utils/versionBundles.mjs";
import which from "which";

interface SubmitMessageValue {
  projectName: string;
  boardType: string;
  selectedSDK: string;
  selectedToolchain: string;

  ninjaMode: number;
  ninjaPath: string;
  ninjaVersion: string;
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;

  // features (libraries)
  spiFeature: boolean;
  pioFeature: boolean;
  i2cFeature: boolean;
  dmaFeature: boolean;
  hwwatchdogFeature: boolean;
  hwclocksFeature: boolean;
  hwinterpolationFeature: boolean;
  hwtimerFeature: boolean;

  // stdio support
  uartStdioSupport: boolean;
  usbStdioSupport: boolean;

  // pico wireless options
  picoWireless: number;

  // code generation options
  addExamples: boolean;
  runFromRAM: boolean;
  cpp: boolean;
  cppRtti: boolean;
  cppExceptions: boolean;

  // debugger
  debugger: number;
}

interface WebviewMessage {
  command: string;
  value: object | string | SubmitMessageValue;
}

enum BoardType {
  pico = "Pico",
  picoW = "Pico W",
}

enum ConsoleOption {
  consoleOverUART = "Console over UART",
  consoleOverUSB = "Console over USB (disables other USB use)",
}

enum Library {
  spi = "SPI",
  i2c = "I2C",
  dma = "DMA support",
  pio = "PIO",
  interp = "HW interpolation",
  timer = "HW timer",
  watch = "HW watchdog",
  clocks = "HW clocks",
}

enum PicoWirelessOption {
  none = "None",
  picoWLed = "Pico W onboard LED",
  picoWPoll = "Polled lwIP",
  picoWBackground = "Background lwIP",
}

enum CodeOption {
  addExamples = "Add examples from Pico library",
  runFromRAM = "Run the program from RAM rather than flash",
  cpp = "Generate C++ code",
  cppRtti = "Enable C++ RTTI (Uses more memory)",
  cppExceptions = "Enable C++ exceptions (Uses more memory)",
}

enum Debugger {
  debugProbe = "DebugProbe (CMSIS-DAP) [Default]",
  swd = "SWD (Pi host)",
}

function enumToParam(
  e:
    | BoardType
    | ConsoleOption
    | Library
    | PicoWirelessOption
    | CodeOption
    | Debugger
): string {
  switch (e) {
    case BoardType.pico:
      return "-board pico";
    case BoardType.picoW:
      return "-board pico_w";
    case ConsoleOption.consoleOverUART:
      return "-uart";
    case ConsoleOption.consoleOverUSB:
      return "-usb";
    case Library.spi:
      return "-f spi";
    case Library.i2c:
      return "-f i2c";
    case Library.dma:
      return "-f dma";
    case Library.pio:
      return "-f pio";
    case Library.interp:
      return "-f interp";
    case Library.timer:
      return "-f timer";
    case Library.watch:
      return "-f watch";
    case Library.clocks:
      return "-f clocks";
    case PicoWirelessOption.picoWLed:
      return "-f picow_led";
    case PicoWirelessOption.picoWPoll:
      return "-f picow_poll";
    case PicoWirelessOption.picoWBackground:
      return "-f picow_background";
    case CodeOption.addExamples:
      return "-x";
    case CodeOption.runFromRAM:
      return "-r";
    case CodeOption.cpp:
      return "-cpp";
    case CodeOption.cppRtti:
      return "-cpprtti";
    case CodeOption.cppExceptions:
      return "-cppex";
    case Debugger.debugProbe:
      return "-d 0";
    case Debugger.swd:
      return "-d 1";
    default:
      // TODO: maybe just return an empty string
      throw new Error(`Unknown enum value: ${e as string}`);
  }
}

interface NewProjectOptions {
  name: string;
  projectRoot: string;
  boardType: BoardType;
  consoleOptions: ConsoleOption[];
  libraries: Array<Library | PicoWirelessOption>;
  codeOptions: CodeOption[];
  debugger: Debugger;
  toolchainAndSDK: {
    toolchainVersion: string;
    toolchainPath: string;
    sdkVersion: string;
    sdkPath: string;
  };
  ninjaExecutable: string;
  cmakeExecutable: string;
}

export function getWebviewOptions(extensionUri: Uri): WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [Uri.joinPath(extensionUri, "web")],
  };
}

export function getProjectFolderDialogOptions(
  projectRoot?: Uri
): OpenDialogOptions {
  return {
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select",
    title: "Select a project root to create the new project folder in",
    defaultUri: projectRoot,
  };
}

export class NewProjectPanel {
  public static currentPanel: NewProjectPanel | undefined;

  public static readonly viewType = "newPicoProject";

  private readonly _panel: WebviewPanel;
  private readonly _extensionUri: Uri;
  private readonly _settings: Settings;
  private readonly _logger: Logger = new Logger("NewProjectPanel");
  private _disposables: Disposable[] = [];

  private _projectRoot?: Uri;
  private _supportedToolchains?: SupportedToolchainVersion[];
  private _versionBundle: VersionBundle | undefined;

  public static createOrShow(settings: Settings, extensionUri: Uri): void {
    const column = window.activeTextEditor
      ? window.activeTextEditor.viewColumn
      : undefined;

    if (NewProjectPanel.currentPanel) {
      NewProjectPanel.currentPanel._panel.reveal(column);

      return;
    }

    const panel = window.createWebviewPanel(
      NewProjectPanel.viewType,
      "New Pico Project",
      column || ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    NewProjectPanel.currentPanel = new NewProjectPanel(
      panel,
      settings,
      extensionUri
    );
  }

  public static revive(
    panel: WebviewPanel,
    settings: Settings,
    extensionUri: Uri
  ): void {
    NewProjectPanel.currentPanel = new NewProjectPanel(
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

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.command) {
          case "changeLocation":
            {
              const newLoc = await window.showOpenDialog(
                getProjectFolderDialogOptions(this._projectRoot)
              );

              if (newLoc && newLoc[0]) {
                // overwrite preview folderUri
                this._projectRoot = newLoc[0];

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

              // give feedback to user
              // TODO: change into progress message
              void window.showInformationMessage(
                `Generating project ${data.projectName ?? "undefined"} in ${
                  this._projectRoot?.fsPath
                }, this may take a while...`
              );

              // close panel before generating project
              this.dispose();

              const projectPath = this._projectRoot?.fsPath ?? "";

              // check if message is valid
              if (
                typeof message.value === "object" &&
                message.value !== null &&
                projectPath !== ""
              ) {
                const selectedSDK = data.selectedSDK.slice(0);
                const selectedToolchain = this._supportedToolchains?.find(
                  tc =>
                    tc.version === data.selectedToolchain.replaceAll(".", "_")
                );

                if (!selectedToolchain) {
                  void window.showErrorMessage(
                    "Failed to find selected toolchain."
                  );

                  return;
                }

                // install selected sdk and toolchain if necessary
                // show user feedback as downloads can take a while
                let installedSuccessfully = false;
                await window.withProgress(
                  {
                    location: ProgressLocation.Notification,
                    title: "Downloading SDK and Toolchain",
                    cancellable: false,
                  },
                  async progress => {
                    // download both
                    if (
                      !(await downloadAndInstallSDK(
                        selectedSDK,
                        SDK_REPOSITORY_URL,
                        this._settings
                      )) ||
                      !(await downloadAndInstallToolchain(selectedToolchain))
                    ) {
                      this._logger.error(
                        `Failed to download and install toolchain and SDK.`
                      );

                      progress.report({
                        message:
                          "Failed to download and install toolchain and sdk. " +
                          "Make sure all requirements are met.",
                        increment: 100,
                      });

                      installedSuccessfully = false;
                    } else {
                      installedSuccessfully = true;
                    }
                  }
                );

                if (!installedSuccessfully) {
                  return;
                }

                let ninjaExecutable: string;
                let cmakeExecutable: string;
                switch (data.ninjaMode) {
                  case 0:
                    if (this._versionBundle !== undefined) {
                      data.ninjaVersion = this._versionBundle.ninja;
                    } else {
                      this._logger.error(
                        "Failed to get version bundle for ninja."
                      );
                      await window.showErrorMessage(
                        "Failed to get ninja version for the selected Pico-SDK version."
                      );

                      return;
                    }
                  // eslint-disable-next-line no-fallthrough
                  case 2:
                    installedSuccessfully = false;
                    await window.withProgress(
                      {
                        location: ProgressLocation.Notification,
                        title: "Download and install ninja",
                        cancellable: false,
                      },
                      async progress => {
                        if (await downloadAndInstallNinja(data.ninjaVersion)) {
                          progress.report({
                            message:
                              "Successfully downloaded and installed ninja.",
                            increment: 100,
                          });

                          installedSuccessfully = true;
                        } else {
                          installedSuccessfully = false;
                          progress.report({
                            message:
                              "Failed to download and install ninja. Make sure all requirements are met.",
                            increment: 100,
                          });
                        }
                      }
                    );

                    if (!installedSuccessfully) {
                      return;
                    } else {
                      // TODO: maybe custom with normal / also on windows for json
                      ninjaExecutable = join(
                        buildNinjaPath(data.ninjaVersion),
                        //process.platform !== "win32" ? "ninja" : "ninja.exe"
                        "ninja"
                      );
                    }
                    break;
                  case 1:
                    ninjaExecutable = "ninja";
                    break;
                  case 3:
                    ninjaExecutable = data.ninjaPath;
                    break;

                  default:
                    await window.showErrorMessage("Unknown ninja selection.");
                    this._logger.error("Unknown ninja selection.");

                    return;
                }

                switch (data.cmakeMode) {
                  case 0:
                    if (this._versionBundle !== undefined) {
                      data.cmakeVersion = this._versionBundle.cmake;
                    }
                  // eslint-disable-next-line no-fallthrough
                  case 2:
                    installedSuccessfully = false;
                    await window.withProgress(
                      {
                        location: ProgressLocation.Notification,
                        title: "Download and install cmake",
                        cancellable: false,
                      },
                      async progress => {
                        if (await downloadAndInstallCmake(data.cmakeVersion)) {
                          progress.report({
                            message:
                              "Successfully downloaded and installed cmake.",
                            increment: 100,
                          });

                          installedSuccessfully = true;
                        } else {
                          installedSuccessfully = false;
                          progress.report({
                            message:
                              "Failed to download and install cmake. Make sure all requirements are met.",
                            increment: 100,
                          });
                        }
                      }
                    );

                    if (!installedSuccessfully) {
                      return;
                    } else {
                      // TODO: create platform independent cmake paths with symlinks
                      // so .pico-sdk/cmake/3.20.0/cmake always points to the executable
                      if (process.platform === "win32") {
                        cmakeExecutable = join(
                          buildCMakePath(data.cmakeVersion),
                          "bin",
                          //"cmake.exe"
                          // make it more platform independent
                          "cmake"
                        );
                      } else if (process.platform === "darwin") {
                        cmakeExecutable = join(
                          buildCMakePath(data.cmakeVersion),
                          "CMake.app",
                          "Contents",
                          "bin",
                          "cmake"
                        );
                      } else {
                        cmakeExecutable = join(
                          buildCMakePath(data.cmakeVersion),
                          "bin",
                          "cmake"
                        );
                      }
                    }
                    break;
                  case 1:
                    cmakeExecutable = "cmake";
                    break;
                  case 3:
                    cmakeExecutable = data.cmakePath;
                    break;
                  default:
                    await window.showErrorMessage("Unknown cmake selection.");
                    this._logger.error("Unknown cmake selection.");

                    return;
                }

                const args: NewProjectOptions = {
                  name: data.projectName,
                  projectRoot: projectPath,
                  boardType:
                    data.boardType === "pico-w"
                      ? BoardType.picoW
                      : BoardType.pico,
                  consoleOptions: [
                    data.uartStdioSupport
                      ? ConsoleOption.consoleOverUART
                      : null,
                    data.usbStdioSupport ? ConsoleOption.consoleOverUSB : null,
                  ].filter(option => option !== null) as ConsoleOption[],
                  libraries: [
                    data.spiFeature ? Library.spi : null,
                    data.i2cFeature ? Library.i2c : null,
                    data.dmaFeature ? Library.dma : null,
                    data.pioFeature ? Library.pio : null,
                    data.hwinterpolationFeature ? Library.interp : null,
                    data.hwtimerFeature ? Library.timer : null,
                    data.hwwatchdogFeature ? Library.watch : null,
                    data.hwclocksFeature ? Library.clocks : null,
                  ].filter(option => option !== null) as Library[],
                  codeOptions: [
                    data.addExamples ? CodeOption.addExamples : null,
                    data.runFromRAM ? CodeOption.runFromRAM : null,
                    data.cpp ? CodeOption.cpp : null,
                    data.cppRtti ? CodeOption.cppRtti : null,
                    data.cppExceptions ? CodeOption.cppExceptions : null,
                  ].filter(option => option !== null) as CodeOption[],
                  debugger:
                    data.debugger === 1 ? Debugger.swd : Debugger.debugProbe,
                  toolchainAndSDK: {
                    toolchainVersion: selectedToolchain.version,
                    toolchainPath: buildToolchainPath(
                      selectedToolchain.version
                    ),
                    sdkVersion: selectedSDK,
                    sdkPath: buildSDKPath(selectedSDK),
                  },
                  ninjaExecutable,
                  cmakeExecutable,
                };

                await this._executePicoProjectGenerator(args);
              }
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _update(): Promise<void> {
    this._panel.title = "New Pico Project";
    this._panel.iconPath = Uri.joinPath(
      this._extensionUri,
      "web",
      "raspberry-24.png"
    );
    const html = await this._getHtmlForWebview(this._panel.webview);

    if (html !== "") {
      this._panel.webview.html = html;
      await this._updateTheme();
    } else {
      void window.showErrorMessage(
        "Failed to load available Pico-SDKs and/or supported toolchains."
      );
      this.dispose();
    }
  }

  private async _updateTheme(): Promise<void> {
    await this._panel.webview.postMessage({
      command: "setTheme",
      theme:
        window.activeColorTheme.kind === ColorThemeKind.Dark ? "dark" : "light",
    });
  }

  public dispose(): void {
    NewProjectPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();

      if (x) {
        x.dispose();
      }
    }
  }

  private async _getHtmlForWebview(webview: Webview): Promise<string> {
    // TODO: sore in memory so on future update static stuff doesn't need to be read again
    const mainScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "main.js")
    );
    const navScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "nav.js")
    );
    const tailwindcssScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "tailwindcss-3_3_5.js")
    );

    const mainStyleUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "main.css")
    );

    // images
    const navHeaderSvgUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "raspberrypi-nav-header.svg")
    );

    const versionBundlesLoader = new VersionBundlesLoader(this._extensionUri);

    // construct auxiliar html
    // TODO: add offline handling - only load installed ones
    let toolchainsHtml = "";
    let picoSDKsHtml = "";
    let ninjasHtml = "";
    let cmakesHtml = "";

    //const installedSDKs = detectInstalledSDKs();
    //const installedToolchains = detectInstalledToolchains();
    //installedSDKs.sort((a, b) =>
    //compare(a.version.replace("v", ""), b.version.replace("v", ""))
    //);

    try {
      const availableSDKs = await getSDKReleases();
      const supportedToolchains = await getSupportedToolchains();
      const ninjaReleases = await getNinjaReleases();
      const cmakeReleases = await getCmakeReleases();
      this._versionBundle = versionBundlesLoader.getModuleVersion(
        availableSDKs[0].tagName.replace("v", "")
      );

      availableSDKs
        .sort((a, b) => compare(b.tagName, a.tagName))
        .forEach(sdk => {
          picoSDKsHtml += `<option ${
            picoSDKsHtml.length === 0 ? "selected " : ""
          }value="${sdk.tagName}">v${sdk.tagName}</option>`;
        });

      supportedToolchains.forEach(toolchain => {
        toolchainsHtml += `<option ${
          toolchainsHtml.length === 0 ? "selected " : ""
        }value="${toolchain.version}">${toolchain.version.replaceAll(
          "_",
          "."
        )}</option>`;
      });

      ninjaReleases
        .sort((a, b) =>
          compare(b.tagName.replace("v", ""), a.tagName.replace("v", ""))
        )
        .forEach(ninja => {
          ninjasHtml += `<option ${
            ninjasHtml.length === 0 ? "selected " : ""
          }value="${ninja.tagName}">${ninja.tagName}</option>`;
        });

      cmakeReleases.forEach(cmake => {
        cmakesHtml += `<option ${
          cmakesHtml.length === 0 ? "selected " : ""
        }value="${cmake.tagName}">${cmake.tagName}</option>`;
      });

      if (
        toolchainsHtml.length === 0 ||
        picoSDKsHtml.length === 0 ||
        (process.platform !== "linux" && ninjasHtml.length === 0)
      ) {
        this._logger.error("Failed to load toolchains or SDKs.");

        return "";
      }
      this._supportedToolchains = supportedToolchains;
      // toolchains should be sorted and cant be sorted by compare because
      // of their alphanumeric structure
    } catch (error) {
      this._logger.error(
        `Error while retrieving SDK and toolchain versions: ${
          error instanceof Error ? error.message : (error as string)
        }`
      );

      void window.showErrorMessage(
        "Error while retrieving SDK and toolchain versions."
      );

      return "";
    }

    const isNinjaSystemAvailable = (await which("ninja")) !== null;
    const isCmakeSystemAvailable = (await which("cmake")) !== null;

    // Restrict the webview to only load specific scripts
    const nonce = getNonce();

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

        <title>New Pico Project</title>

        <script nonce="${nonce}" src="${tailwindcssScriptUri.toString()}"></script>
        <script nonce="${nonce}">
          tailwind.config = {
            darkMode: 'class',
          }
        </script>
      </head>
      <body class="scroll-smooth w-screen">
        <div id="above-nav" class="container max-w-6xl mx-auto flex justify-between items-center w-full sticky top-0 z-10 pl-5 h-5">
        </div>
        <nav class="container max-w-6xl mx-auto flex justify-between items-center w-full sticky top-5 z-10 pl-5 h-24 bg-opacity-95 bg-slate-800 rounded-md">
            <div class="inline-flex h-16 align-middle">
                <img src="${navHeaderSvgUri.toString()}" alt="raspberry pi logo" class="h-16 rounded cursor-not-allowed block mb-2"/>
            </div>
            <ul class="pl-3 pr-3 flex space-x-4 h-auto align-middle">
                <li class="nav-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-basic">
                    Basic Settings
                </li>
                <li class="nav-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-features">
                    Features
                </li>
                <li class="nav-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-stdio">
                    Stdio support
                </li>
                <li class="nav-item hidden text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-pico-wireless">
                    Pico wireless options
                </li>
                <li class="nav-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-code-gen">
                    Code generation options
                </li>
                <li class="nav-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-debugger">
                    Debugger
                </li>
            </ul>
        </nav>
        <main class="container max-w-3xl xl:max-w-5xl mx-auto relative top-14 snap-y mb-20">
            <div id="section-basic" class="snap-start">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Basic Settings</h3>
                <form>
                    <div class="grid gap-6 md:grid-cols-2">
                        <div>
                            <label for="inp-project-name" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Name</label>
                            <input type="text" id="inp-project-name" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="MyProject" required/>
                        </div>
                        <div>
                            <label for="sel-board-type" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Board type</label>
                            <select id="sel-board-type" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                                <option value="pico" selected>Pico</option>
                                <option value="pico-w">Pico W</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-6 mb-4">
                        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="file_input">Location</label>
                        <div class="flex">
                            <div class="w-full left-0 flex">
                                <span class="inline-flex items-center px-3 text-lg text-gray-900 bg-gray-200 border border-r-0 border-gray-300 rounded-l-md dark:bg-gray-600 dark:text-gray-400 dark:border-gray-600">
                                    💾
                                </span>
                                <input type="text" id="inp-project-location" class="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-gray-500 dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="C:\\MyProject" disabled/>
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
                    <div class="grid gap-6 md:grid-cols-2 mt-6">
                      <div>
                        <label for="sel-pico-sdk" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Select Pico-SDK version</label>
                        <select id="sel-pico-sdk" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                              ${picoSDKsHtml}
                        </select>
                      </div>
                      <div>
                        <label for="sel-toolchain" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Select ARM Embeded Toolchain version</label>
                        <select id="sel-toolchain" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                              ${toolchainsHtml}
                        </select>
                      </div>
                    </div>
                    <div class="grid gap-6 md:grid-cols-4 mt-6">
                      <div class="col-span-2">
                        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Ninja Version:</label>

                        ${
                          this._versionBundle !== undefined
                            ? `<div class="flex items-center mb-2">
                                <input type="radio" id="ninja-radio-default-version" name="ninja-version-radio" value="0" class="mr-1 text-blue-500">
                                <label for="ninja-radio-default-version" class="text-gray-900 dark:text-white">Default version</label>
                              </div>`
                            : ""
                        }

                        ${
                          isNinjaSystemAvailable
                            ? `<div class="flex items-center mb-2" >
                                <input type="radio" id="ninja-radio-system-version" name="ninja-version-radio" value="1" class="mr-1 text-blue-500">
                                <label for="ninja-radio-system-version" class="text-gray-900 dark:text-white">Use system version</label>
                              </div>`
                            : ""
                        }

                        <div class="flex items-center mb-2">
                          <input type="radio" id="ninja-radio-select-version" name="ninja-version-radio" value="2" class="mr-1 text-blue-500">
                          <label for="ninja-radio-select-version" class="text-gray-900 dark:text-white">Select version:</label>
                          <select id="sel-ninja" class="ml-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                            ${ninjasHtml}
                          </select>
                        </div>

                        <div class="flex items-center mb-2">
                          <input type="radio" id="ninja-radio-path-executable" name="ninja-version-radio" value="3" class="mr-1 text-blue-500">
                          <label for="ninja-radio-path-executable" class="text-gray-900 dark:text-white">Path to executable:</label>
                          <input type="file" id="ninja-path-executable" multiple="false" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ms-2">
                        </div>
                      </div>
                    
                      <div class="col-span-2">
                        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">CMake Version:</label>

                        ${
                          this._versionBundle !== undefined
                            ? `<div class="flex items-center mb-2">
                                <input type="radio" id="cmake-radio-default-version" name="cmake-version-radio" value="0" class="mr-1 text-blue-500">
                                <label for="cmake-radio-default-version" class="text-gray-900 dark:text-white">Default version</label>
                              </div>`
                            : ""
                        }

                        ${
                          isCmakeSystemAvailable
                            ? `<div class="flex items-center mb-2" >
                                <input type="radio" id="cmake-radio-system-version" name="cmake-version-radio" value="1" class="mr-1 text-blue-500">
                                <label for="cmake-radio-system-version" class="text-gray-900 dark:text-white">Use system version</label>
                              </div>`
                            : ""
                        }

                        <div class="flex items-center mb-2">
                          <input type="radio" id="cmake-radio-select-version" name="cmake-version-radio" value="2" class="mr-1 text-blue-500">
                          <label for="cmake-radio-select-version" class="text-gray-900 dark:text-white">Select version:</label>
                          <select id="sel-cmake" class="ml-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                            ${cmakesHtml}
                          </select>
                        </div>

                        <div class="flex items-center mb-2">
                          <input type="radio" id="cmake-radio-path-executable" name="cmake-version-radio" value="3" class="mr-1 text-blue-500">
                          <label for="cmake-radio-path-executable" class="text-gray-900 dark:text-white">Path to executable:</label>
                          <input type="file" id="cmake-path-executable" multiple="false" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ms-2">
                        </div>
                      </div>
                    </div>
                </form>
            </div>
            <div id="section-features" class="snap-start mt-10">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Features</h3>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="spi-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="spi-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">SPI</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="pio-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="pio-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">PIO interface</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="i2c-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="i2c-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">I2C interface</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="dma-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="dma-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">DMA support</label>
                        </div>
                    </li>
                </ul>
                <ul class="items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwwatchdog-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwwatchdog-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW watchdog</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwclocks-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwclocks-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW clocks</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwinterpolation-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwinterpolation-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW interpolation</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwtimer-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwtimer-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW timer</label>
                        </div>
                    </li>
                </ul>
            </div>
            <div id="section-stdio" class="snap-start mt-10">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Stdio support</h3>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                    <div class="flex items-center pl-3">
                      <input id="uart-stdio-support-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                      <label for="uart-stdio-support-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Console over UART</label>
                    </div>
                  </li>
                  <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                    <div class="flex items-center pl-3">
                      <input id="usb-stdio-support-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                      <label for="usb-stdio-support-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Console over USB (disables other USB use)</label>
                    </div>
                  </li>
                </ul>
            </div>
            <div id="section-pico-wireless" class="snap-start mt-10" hidden>
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Pico wireless options</h3>
                <div class="flex items-stretch space-x-4">
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input checked id="pico-wireless-radio-none" type="radio" value="0" name="pico-wireless-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="pico-wireless-radio-none" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">None</label>
                    </div>
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input id="pico-wireless-radio-led" type="radio" value="1" name="pico-wireless-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="pico-wireless-radio-led" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Pico W onboard LED</label>
                    </div>
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input id="pico-wireless-radio-pool" type="radio" value="2" name="pico-wireless-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="pico-wireless-radio-pool" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Polled lwIP</label>
                    </div>
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input id="pico-wireless-radio-background" type="radio" value="3" name="pico-wireless-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="pico-wireless-radio-background" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Background lwIP</label>
                    </div>
                </div>
            </div>
            <div id="section-code-gen" class="snap-start mt-10">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Code generation options</h3>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="add-examples-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="add-examples-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Add examples from Pico library</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="run-from-ram-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="run-from-ram-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Run the program from RAM rather than flash</label>
                        </div>
                    </li>
                </ul>
                <ul class="items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                    <div class="flex items-center pl-3">
                      <input id="cpp-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                      <label for="cpp-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Generate C++ code</label>
                    </div>
                  </li>
                  <li class="w-full dark:border-gray-600">
                    <div class="flex items-center pl-3">
                      <input id="cpp-rtti-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                      <label for="cpp-rtti-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Enable C++ RTTI (Uses more memory)</label>
                    </div>
                  </li>    
                  <li class="w-full dark:border-gray-600">
                    <div class="flex items-center pl-3">
                      <input id="cpp-exceptions-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                      <label for="cpp-exceptions-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Enable C++ exceptions (Uses more memory)</label>
                    </div>
                  </li>
                </ul>
            </div>
            <div id="section-debugger" class="snap-start mt-10">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Debugger</h3>
                <div class="flex items-stretch space-x-4">
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input checked id="debugger-radio-debug-probe" type="radio" value="0" name="debugger-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="debugger-radio-debug-probe" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">DebugProbe (CMSIS-DAP) [Default]</label>
                    </div>
                    <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                        <input id="debugger-radio-swd" type="radio" value="1" name="debugger-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                        <label for="debugger-radio-swd" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">SWD (Pi host)</label>
                    </div>
                </div>
            </div>
            <div class="bottom-3 mt-8 mb-12 w-full flex justify-end">
                <button id="btn-cancel" class="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-lg px-4 py-2 mr-4 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-90">Cancel</button>
                <button id="btn-create" class="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-lg px-4 py-2 mr-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800">Create</button>
            </div>
        </main>

        <script nonce="${nonce}" src="${navScriptUri.toString()}"></script>
        <script nonce="${nonce}" src="${mainScriptUri.toString()}"></script>
      </body>
    </html>`;
  }

  private _runGenerator(
    command: string,
    options: ExecOptions
  ): Promise<number | null> {
    return new Promise<number | null>(resolve => {
      const generatorProcess = exec(command, options, error => {
        if (error) {
          console.error(`Error: ${error.message}`);
          resolve(null); // Indicate error
        }
      });

      generatorProcess.on("exit", code => {
        // Resolve with exit code or -1 if code is undefined
        resolve(code);
      });
    });
  }

  // TODO: move out of NewProjectPanel class
  /**
   * Executes the Pico Project Generator with the given options.
   *
   * @param options {@link NewProjectOptions} to pass to the Pico Project Generator
   */
  private async _executePicoProjectGenerator(
    options: NewProjectOptions
  ): Promise<void> {
    const customEnv: { [key: string]: string } = {
      ...(process.env as { [key: string]: string }),
      // set PICO_SDK_PATH
      ["PICO_SDK_PATH"]: options.toolchainAndSDK.sdkPath,
      // set PICO_TOOLCHAIN_PATH
      ["PICO_TOOLCHAIN_PATH"]: options.toolchainAndSDK.toolchainPath,
    };
    // add compiler to PATH
    const isWindows = process.platform === "win32";
    customEnv[isWindows ? "Path" : "PATH"] = `${join(
      options.toolchainAndSDK.toolchainPath,
      "bin"
    )}${isWindows ? ";" : ":"}${join(dirname(options.cmakeExecutable))}${
      isWindows ? ";" : ":"
    }${join(dirname(options.ninjaExecutable))}${isWindows ? ";" : ":"}${
      customEnv[isWindows ? "Path" : "PATH"]
    }`;
    const pythonExe =
      this._settings.getString(SettingsKey.python3Path) || isWindows
        ? "python"
        : "python3";

    const command: string = [
      pythonExe,
      join(getScriptsRoot(), "pico_project.py"),
      enumToParam(options.boardType),
      ...options.consoleOptions.map(option => enumToParam(option)),
      !options.consoleOptions.includes(ConsoleOption.consoleOverUART)
        ? "-nouart"
        : "",
      ...options.libraries.map(option => enumToParam(option)),
      ...options.codeOptions.map(option => enumToParam(option)),
      enumToParam(options.debugger),
      // generate .vscode config
      "--project",
      "vscode",
      "--projectRoot",
      `"${options.projectRoot}"`,
      "--sdkVersion",
      options.toolchainAndSDK.sdkVersion,
      "--toolchainVersion",
      options.toolchainAndSDK.toolchainVersion,
      "--ninjaPath",
      options.ninjaExecutable,
      "--cmakePath",
      options.cmakeExecutable,
      options.name,
    ].join(" ");

    this._logger.debug(`Executing project generator command: ${command}`);

    // execute command
    // TODO: use exit codes to determine why the project generator failed (if it did)
    // to be able to show the user a more detailed error message
    const generatorExitCode = await this._runGenerator(command, {
      env: customEnv,
      cwd: getScriptsRoot(),
      windowsHide: true,
      timeout: 15000,
    });
    if (generatorExitCode === 0) {
      void window.showInformationMessage(
        `Successfully generated new project: ${options.name}`
      );

      // open new folder
      void commands.executeCommand(
        "vscode.openFolder",
        Uri.file(join(options.projectRoot, options.name)),
        (workspace.workspaceFolders?.length ?? 0) > 0
      );
    } else {
      this._logger.error(
        `Generator Process exited with code: ${generatorExitCode ?? "null"}`
      );

      void window.showErrorMessage(
        `Could not create new project: ${options.name}`
      );
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

function getScriptsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
}
