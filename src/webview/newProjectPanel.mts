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
  type Progress,
} from "vscode";
import { type ExecOptions, exec } from "child_process";
import { HOME_VAR } from "../settings.mjs";
import Settings from "../settings.mjs";
import Logger from "../logger.mjs";
import { join } from "path";
import { join as joinPosix } from "path/posix";
import {
  type SupportedToolchainVersion,
  getSupportedToolchains,
} from "../utils/toolchainUtil.mjs";
import {
  SDK_REPOSITORY_URL,
  getCmakeReleases,
  getNinjaReleases,
  getPicotoolReleases,
  getSDKReleases,
} from "../utils/githubREST.mjs";
import {
  buildCMakePath,
  buildNinjaPath,
  buildSDKPath,
  buildToolchainPath,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
  downloadAndInstallPicotool,
  getScriptsRoot,
} from "../utils/download.mjs";
import { compare } from "../utils/semverUtil.mjs";
import VersionBundlesLoader, {
  type VersionBundle,
} from "../utils/versionBundles.mjs";
import which from "which";
import { homedir } from "os";
import { readFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import {
  type Example,
  loadExamples,
  setupExample,
} from "../utils/examplesUtil.mjs";
import { unknownErrorToString } from "../utils/errorHelper.mjs";
import type { Progress as GotProgress } from "got";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";

export const NINJA_AUTO_INSTALL_DISABLED = false;
// process.platform === "linux" && process.arch === "arm64";

export const openOCDVersion = "0.12.0+dev";

interface ImportProjectMessageValue {
  selectedSDK: string;
  selectedToolchain: string;
  selectedPicotool: string;
  ninjaMode: number;
  ninjaPath: string;
  ninjaVersion: string;
  cmakeMode: number;
  cmakePath: string;
  cmakeVersion: string;

  // debugger
  debugger: number;
  useCmakeTools: boolean;
}

interface SubmitExampleMessageValue extends ImportProjectMessageValue {
  example: string;
  boardType: string;
}

interface SubmitMessageValue extends ImportProjectMessageValue {
  projectName: string;
  boardType: string;

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
  addUartExample: boolean;
  runFromRAM: boolean;
  entryPointProjectName: boolean;
  cpp: boolean;
  cppRtti: boolean;
  cppExceptions: boolean;
}

export interface WebviewMessage {
  command: string;
  value: object | string | SubmitMessageValue;
}

enum BoardType {
  pico = "pico",
  picoW = "pico_w",
  pico2 = "pico2",
  pico2W = "pico2_w",
  other = "other",
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
  addUartExample = "Add UART example code",
  runFromRAM = "Run the program from RAM rather than flash",
  entryPointProjectName = "Use project name as entry point file name",
  cpp = "Generate C++ code",
  cppRtti = "Enable C++ RTTI (Uses more memory)",
  cppExceptions = "Enable C++ exceptions (Uses more memory)",
}

enum Debugger {
  debugProbe = "DebugProbe (CMSIS-DAP) [Default]",
  swd = "SWD (Pi host)",
}

async function enumToBoard(e: BoardType, sdkPath: string): Promise<string> {
  const quickPickItems: string[] = [];
  let board;
  switch (e) {
    case BoardType.pico:
      return "-board pico";
    case BoardType.picoW:
      return "-board pico_w";
    case BoardType.pico2:
      return "-board pico2";
    case BoardType.pico2W:
      return "-board pico2_w";
    case BoardType.other:
      readdirSync(`${sdkPath}/src/boards/include/boards`).forEach(file => {
        quickPickItems.push(file.split(".")[0]);
      });

      // show quick pick for board type
      board = await window.showQuickPick(quickPickItems, {
        placeHolder: "Select Board",
      });

      return `-board ${board}`;
    default:
      // TODO: maybe just return an empty string
      throw new Error(`Unknown enum value: ${e as string}`);
  }
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
      return "-f watchdog";
    case Library.clocks:
      return "-f clocks";
    case PicoWirelessOption.none:
      return "-f picow_none";
    case PicoWirelessOption.picoWLed:
      return "-f picow_led";
    case PicoWirelessOption.picoWPoll:
      return "-f picow_poll";
    case PicoWirelessOption.picoWBackground:
      return "-f picow_background";
    case CodeOption.addUartExample:
      return "-ux";
    case CodeOption.runFromRAM:
      return "-r";
    case CodeOption.entryPointProjectName:
      return "-e";
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

interface ImportProjectOptions {
  projectRoot: string;
  toolchainAndSDK: {
    toolchainVersion: string;
    toolchainPath: string;
    sdkVersion: string;
    sdkPath: string;
    picotoolVersion: string;
    openOCDVersion: string;
  };
  ninjaExecutable: string;
  cmakeExecutable: string;
  debugger: Debugger;
  useCmakeTools: boolean;
}

interface NewExampleBasedProjectOptions extends ImportProjectOptions {
  name: string;
  libNames: [string];
  boardType: BoardType;
}

interface NewProjectOptions extends ImportProjectOptions {
  name: string;
  boardType: BoardType;
  consoleOptions: ConsoleOption[];
  libraries: Array<Library | PicoWirelessOption>;
  codeOptions: CodeOption[];
}

export function getWebviewOptions(extensionUri: Uri): WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [Uri.joinPath(extensionUri, "web")],
  };
}

export function getProjectFolderDialogOptions(
  projectRoot?: Uri,
  forImport: boolean = false
): OpenDialogOptions {
  return {
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select",
    title: forImport
      ? "Select a project folder to import"
      : "Select a project root to create the new project folder in",
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
  private _versionBundlesLoader?: VersionBundlesLoader;
  private _versionBundle: VersionBundle | undefined;
  private _isProjectImport: boolean;
  private _examples: Example[] = [];
  private _isCreateFromExampleOnly: boolean = false;

  public static createOrShow(
    extensionUri: Uri,
    isProjectImport: boolean = false,
    createFromExample: boolean = false,
    projectUri?: Uri
  ): void {
    const column = window.activeTextEditor
      ? window.activeTextEditor.viewColumn
      : undefined;

    if (NewProjectPanel.currentPanel) {
      if (
        NewProjectPanel.currentPanel._isProjectImport === isProjectImport &&
        (NewProjectPanel.currentPanel._isCreateFromExampleOnly
          ? createFromExample
          : true) &&
        (!createFromExample || !isProjectImport)
      ) {
        NewProjectPanel.currentPanel._panel.reveal(column);
        // update already exiting panel with new project root
        if (projectUri) {
          NewProjectPanel.currentPanel._projectRoot = projectUri;
          // update webview
          void NewProjectPanel.currentPanel._panel.webview.postMessage({
            command: "changeLocation",
            value: projectUri?.fsPath,
          });
        }

        if (createFromExample) {
          // update webview
          void NewProjectPanel.currentPanel._panel.webview.postMessage({
            command: "createFromExample",
          });
        } else if (!isProjectImport) {
          void NewProjectPanel.currentPanel._panel.webview.postMessage({
            command: "notCreateFromExample",
          });
        }

        return;
      } else {
        // replace with new one
        NewProjectPanel.currentPanel.dispose();
      }
    }

    const panel = window.createWebviewPanel(
      NewProjectPanel.viewType,
      isProjectImport ? "Import Pico Project" : "New Pico Project",
      column || ViewColumn.One,
      getWebviewOptions(extensionUri)
    );

    const settings = Settings.getInstance();
    if (settings === undefined) {
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

    NewProjectPanel.currentPanel = new NewProjectPanel(
      panel,
      settings,
      extensionUri,
      isProjectImport,
      createFromExample,
      projectUri
    );
  }

  public static revive(
    panel: WebviewPanel,
    extensionUri: Uri,
    isProjectImport: boolean = false,
    createFromExample: boolean = false
  ): void {
    const settings = Settings.getInstance();
    if (settings === undefined) {
      // TODO: maybe add restart button
      void window.showErrorMessage(
        "Failed to load settings. Please restart VSCode."
      );

      return;
    }

    // TODO: reload if it was import panel maybe in state
    NewProjectPanel.currentPanel = new NewProjectPanel(
      panel,
      settings,
      extensionUri,
      isProjectImport,
      createFromExample
    );
  }

  private constructor(
    panel: WebviewPanel,
    settings: Settings,
    extensionUri: Uri,
    isProjectImport: boolean = false,
    createFromExample: boolean = false,
    projectUri?: Uri
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._settings = settings;
    this._isProjectImport = isProjectImport;
    // set local property as it's an indicator for initial projectRoot update
    // later during webview initialization
    projectUri =
      projectUri ??
      (isProjectImport ? undefined : this._settings.getLastProjectRoot());
    this._projectRoot = projectUri;
    this._isCreateFromExampleOnly = createFromExample;

    void this._update(createFromExample);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view changes
    this._panel.onDidChangeViewState(
      async () => {
        if (this._panel.visible) {
          await this._update(createFromExample);
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
                getProjectFolderDialogOptions(
                  this._projectRoot,
                  this._isProjectImport
                )
              );

              if (newLoc && newLoc[0]) {
                // overwrite preview folderUri
                this._projectRoot = newLoc[0];
                if (!this._isProjectImport) {
                  await this._settings.setLastProjectRoot(newLoc[0]);
                }

                // update webview
                await this._panel.webview.postMessage({
                  command: "changeLocation",
                  value: newLoc[0].fsPath,
                });
              }
            }
            break;
          case "versionBundleAvailableTest":
            {
              // test if versionBundle for sdk version is available
              const versionBundle =
                await this._versionBundlesLoader?.getModuleVersion(
                  message.value as string
                );
              // change toolchain version on arm64 linux, as Core-V not available for that
              const riscvToolchain = versionBundle?.riscvToolchain;
              // return result in message of command versionBundleAvailableTest
              await this._panel.webview.postMessage({
                command: "versionBundleAvailableTest",
                value: {
                  result: versionBundle !== undefined,
                  toolchainVersion: versionBundle?.toolchain,
                  riscvToolchainVersion: riscvToolchain,
                  picotoolVersion: versionBundle?.picotool,
                },
              });
            }
            break;
          case "cancel":
            this.dispose();
            break;
          case "error":
            void window.showErrorMessage(message.value as string);
            break;
          case "importProject":
            {
              if (
                this._projectRoot === undefined ||
                this._projectRoot.fsPath === ""
              ) {
                void window.showErrorMessage(
                  this._isProjectImport
                    ? "No project to import selected. Please select a project folder."
                    : "No project root selected. Please select a project root."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              const posixProjectRoot = this._projectRoot.fsPath.replaceAll(
                "\\",
                "/"
              );
              const projectFolderName = posixProjectRoot.substring(
                posixProjectRoot.lastIndexOf("/") + 1
              );
              // a restriction since the folder name is passed as a parameter to the python script for project name
              // if a project is imported
              if (projectFolderName.includes(" ")) {
                void window.showErrorMessage(
                  "Project folder name cannot contain spaces."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              const data = message.value as ImportProjectMessageValue;

              // check the project to import exists
              if (!existsSync(this._projectRoot.fsPath)) {
                void window.showErrorMessage(
                  "The project you are trying to import does not exist."
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
                  title: `Importing project ${projectFolderName} from ${this._projectRoot?.fsPath}, this may take a while...`,
                },
                async progress =>
                  this._generateProjectOperation(progress, data, message)
              );
            }
            break;
          case "submitExample":
            {
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

              const data = message.value as SubmitExampleMessageValue;

              // check if projectRoot/projectName folder already exists
              if (existsSync(join(this._projectRoot.fsPath, data.example))) {
                void window.showErrorMessage(
                  "Project already exists. Please select a different project root or example."
                );
                await this._panel.webview.postMessage({
                  command: "submitDenied",
                });

                return;
              }

              if (this._examples.length === 0) {
                this._examples = await loadExamples();
              }

              const example = this._examples.find(
                example => example.searchKey === data.example
              );
              if (example === undefined) {
                await window.showErrorMessage(
                  "Failed to find example. Try reinstalling the extension."
                );

                return;
              }

              // close panel before generating project
              this.dispose();

              // required to support backslashes in macOS/Linux folder names
              const targetPath = process.platform !== "win32"
                ? this._projectRoot.fsPath
                : this._projectRoot.fsPath.replaceAll("\\", "/");

              const result = await window.withProgress(
                {
                  location: ProgressLocation.Notification,
                  title: `Downloading ${example.name} example...`,
                  cancellable: false,
                },
                async progress => {
                  // download and install selected example
                  const result = await setupExample(
                    example,
                    targetPath
                  );
          
                  if (result) {
                    this._logger.debug(`Successfully downloaded ${example.name} example.`);
          
                    progress.report({
                      increment: 100,
                      message: `Successfully downloaded ${example.name} example.`,
                    });
          
                    return true;
                  }
          
                  this._logger.error(`Failed to download ${example.name} example.`);
          
                  progress.report({
                    increment: 100,
                  });
          
                  return false;
                }
              );

              if (!result) {
                await window.showErrorMessage("Failed to setup example.");

                return;
              }

              await window.withProgress(
                {
                  location: ProgressLocation.Notification,
                  title: `Generating project based on the ${
                    data.example ?? "undefined"
                  } example in ${
                    this._projectRoot?.fsPath
                  }, this may take a while...`,
                },
                async progress =>
                  this._generateProjectOperation(
                    progress,
                    data,
                    message,
                    example
                  )
              );
            }
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

              if (data.projectName === undefined || data.projectName === "") {
                void window.showWarningMessage("Project name cannot be empty.");
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
                  "Project already exists. Please select a different project name or root."
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
                  title: `Generating project ${
                    data.projectName ?? "undefined"
                  } in ${this._projectRoot?.fsPath}, this may take a while...`,
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

    // if project uri is defined on construction then also tell the webview
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
    data:
      | SubmitMessageValue
      | SubmitExampleMessageValue
      | ImportProjectMessageValue,
    message: WebviewMessage,
    example?: Example
  ): Promise<void> {
    const projectPath = this._projectRoot?.fsPath ?? "";

    // check if message is valid
    // TODO: add an else block if error handling
    if (
      typeof message.value === "object" &&
      message.value !== null &&
      projectPath !== "" &&
      this._versionBundlesLoader !== undefined
    ) {
      const selectedSDK = data.selectedSDK.slice(0);
      const selectedToolchain = this._supportedToolchains?.find(
        tc => tc.version === data.selectedToolchain.replaceAll(".", "_")
      );
      const selectedPicotool = data.selectedPicotool.slice(0);

      if (!selectedToolchain) {
        void window.showErrorMessage("Failed to find selected toolchain.");

        return;
      }

      // update to new selected sdk);
      this._versionBundle = await this._versionBundlesLoader.getModuleVersion(
        selectedSDK
      );

      if (
        this._versionBundle === undefined &&
        // if no versionBundle then all version options the could be dependent on it must be custom (=> independent of versionBundle)
        (data.ninjaMode === 0 || data.cmakeMode === 0)
      ) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        void window.showErrorMessage("Failed to find selected SDK version.");

        return;
      }

      // install python (if necessary)
      const python3Path = await findPython();
      if (!python3Path) {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        this._logger.error("Failed to find Python3 executable.");
        showPythonNotFoundError();

        return;
      }

      // install selected sdk and toolchain if necessary
      // show user feedback as downloads can take a while
      let installedSuccessfully = true;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing SDK",
          cancellable: false,
        },
        async progress2 => {
          const result = await downloadAndInstallSDK(
            selectedSDK,
            SDK_REPOSITORY_URL,
            // python3Path is only possible undefined if downloaded and there is already checked and returned if this happened
            python3Path.replace(HOME_VAR, homedir().replaceAll("\\", "/"))
          );

          if (!result) {
            this._logger.error(`Failed to download and install SDK.`);
            installedSuccessfully = false;
            progress2.report({
              message: "Failed - Make sure all requirements are met.",
              increment: 100,
            });

            void window.showErrorMessage(
              "Failed to download and install SDK. Make sure all requirements are met."
            );

            return;
          }
        }
      );

      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return;
      }

      let prog2LastState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing toolchain",
          cancellable: false,
        },
        async progress2 => {
          const result = await downloadAndInstallToolchain(
            selectedToolchain,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            }
          );

          if (!result) {
            this._logger.error(`Failed to download and install toolchain.`);
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            void window.showErrorMessage(
              "Failed to download and install toolchain."
            );

            return;
          }
        }
      );

      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return;
      }

      prog2LastState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing tools",
          cancellable: false,
        },
        async progress2 => {
          const result = await downloadAndInstallTools(
            selectedSDK,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            }
          );

          if (!result) {
            this._logger.error(`Failed to download and install tools.`);
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            void window.showErrorMessage(
              "Failed to download and install tools."
            );

            return;
          }
        }
      );

      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return;
      }

      prog2LastState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing picotool",
          cancellable: false,
        },
        async progress2 => {
          const result = await downloadAndInstallPicotool(
            selectedPicotool,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            }
          );

          if (!result) {
            this._logger.error(`Failed to download and install picotool.`);
            installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            void window.showErrorMessage(
              "Failed to download and install picotool."
            );

            return;
          }
        }
      );

      if (!installedSuccessfully) {
        progress.report({
          message: "Failed",
          increment: 100,
        });

        return;
      }

      prog2LastState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing OpenOCD",
          cancellable: false,
        },
        async progress2 => {
          const result = await downloadAndInstallOpenOCD(
            openOCDVersion,
            (prog: GotProgress) => {
              const per = prog.percent * 100;
              progress2.report({
                increment: per - prog2LastState,
              });
              prog2LastState = per;
            }
          );

          if (!result) {
            this._logger.error(`Failed to download and install OpenOCD.`);
            // not required
            //installedSuccessfully = false;
            progress2.report({
              message: "Failed",
              increment: 100,
            });

            return;
          }
        }
      );

      let ninjaExecutable: string;
      let cmakeExecutable: string;
      switch (data.ninjaMode) {
        case 0:
          if (this._versionBundle !== undefined) {
            data.ninjaVersion = this._versionBundle.ninja;
          } else {
            this._logger.error("Failed to get version bundle for ninja.");
            progress.report({
              message: "Failed",
              increment: 100,
            });
            await window.showErrorMessage(
              "Failed to get ninja version for the selected Pico SDK version."
            );

            return;
          }
        // eslint-disable-next-line no-fallthrough
        case 2:
          installedSuccessfully = false;
          prog2LastState = 0;
          await window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: "Download and install Ninja",
              cancellable: false,
            },
            async progress2 => {
              if (
                await downloadAndInstallNinja(
                  data.ninjaVersion,
                  (prog: GotProgress) => {
                    const per = prog.percent * 100;
                    progress2.report({
                      increment: per - prog2LastState,
                    });
                    prog2LastState = per;
                  }
                )
              ) {
                progress2.report({
                  message: "Successfully downloaded and installed Ninja.",
                  increment: 100,
                });

                installedSuccessfully = true;
              } else {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });
              }
            }
          );

          if (!installedSuccessfully) {
            progress.report({
              message: "Failed",
              increment: 100,
            });
            void window.showErrorMessage(
              "Failed to download and install ninja. Make sure all requirements are met."
            );

            return;
          } else {
            ninjaExecutable = joinPosix(
              buildNinjaPath(data.ninjaVersion),
              "ninja"
            );
          }
          break;
        case 1:
          ninjaExecutable = "ninja";
          break;
        case 3:
          // normalize path returned by the os selector to posix path for the settings json
          // and cross platform compatibility
          ninjaExecutable =
            process.platform === "win32"
              ? joinPosix(...data.ninjaPath.split("\\"))
              : data.ninjaPath;
          break;

        default:
          progress.report({
            message: "Failed",
            increment: 100,
          });
          void window.showErrorMessage("Unknown ninja selection.");
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
          prog2LastState = 0;
          await window.withProgress(
            {
              location: ProgressLocation.Notification,
              title: "Download and install CMake",
              cancellable: false,
            },
            async progress2 => {
              if (
                await downloadAndInstallCmake(
                  data.cmakeVersion,
                  (prog: GotProgress) => {
                    const per = prog.percent * 100;
                    progress2.report({
                      increment: per - prog2LastState,
                    });
                    prog2LastState = per;
                  }
                )
              ) {
                progress.report({
                  // TODO: maybe just finished or something like that
                  message: "Successfully downloaded and installed CMake.",
                  increment: 100,
                });

                installedSuccessfully = true;
              } else {
                installedSuccessfully = false;
                progress2.report({
                  message: "Failed",
                  increment: 100,
                });
              }
            }
          );

          if (!installedSuccessfully) {
            progress.report({
              message: "Failed",
              increment: 100,
            });
            void window.showErrorMessage(
              // TODO: maybe remove all requirements met part
              "Failed to download and install CMake. Make sure all requirements are met."
            );

            return;
          } else {
            const cmakeVersionBasePath = buildCMakePath(data.cmakeVersion);

            cmakeExecutable = joinPosix(cmakeVersionBasePath, "bin", "cmake");
          }
          break;
        case 1:
          cmakeExecutable = "cmake";
          break;
        case 3:
          // normalize path returned by the os selector to posix path for the settings json
          // and cross platform compatibility
          cmakeExecutable =
            process.platform === "win32"
              ? // TODO: maybe use path.sep for split
                joinPosix(...data.cmakePath.split("\\"))
              : data.cmakePath;
          break;
        default:
          progress.report({
            message: "Failed",
            increment: 100,
          });
          void window.showErrorMessage("Unknown cmake selection.");
          this._logger.error("Unknown cmake selection.");

          return;
      }

      if (example === undefined && !this._isProjectImport) {
        const theData = data as SubmitMessageValue;

        await this._settings.setEntryPointNamingPref(
          theData.entryPointProjectName
        );

        const args: NewProjectOptions = {
          name: theData.projectName,
          projectRoot: projectPath,
          boardType: theData.boardType as BoardType,
          consoleOptions: [
            theData.uartStdioSupport ? ConsoleOption.consoleOverUART : null,
            theData.usbStdioSupport ? ConsoleOption.consoleOverUSB : null,
          ].filter(option => option !== null),
          libraries: [
            theData.spiFeature ? Library.spi : null,
            theData.i2cFeature ? Library.i2c : null,
            theData.dmaFeature ? Library.dma : null,
            theData.pioFeature ? Library.pio : null,
            theData.hwinterpolationFeature ? Library.interp : null,
            theData.hwtimerFeature ? Library.timer : null,
            theData.hwwatchdogFeature ? Library.watch : null,
            theData.hwclocksFeature ? Library.clocks : null,
            ["pico_w", "pico2_w"].includes(theData.boardType)
              ? Object.values(PicoWirelessOption)[theData.picoWireless]
              : null,
          ].filter(option => option !== null) as Library[],
          codeOptions: [
            theData.addUartExample ? CodeOption.addUartExample : null,
            theData.runFromRAM ? CodeOption.runFromRAM : null,
            theData.entryPointProjectName
              ? CodeOption.entryPointProjectName
              : null,
            theData.cpp ? CodeOption.cpp : null,
            theData.cppRtti ? CodeOption.cppRtti : null,
            theData.cppExceptions ? CodeOption.cppExceptions : null,
          ].filter(option => option !== null),
          debugger: data.debugger === 1 ? Debugger.swd : Debugger.debugProbe,
          toolchainAndSDK: {
            toolchainVersion: selectedToolchain.version,
            toolchainPath: buildToolchainPath(selectedToolchain.version),
            sdkVersion: selectedSDK,
            sdkPath: buildSDKPath(selectedSDK),
            picotoolVersion: selectedPicotool,
            openOCDVersion: openOCDVersion,
          },
          ninjaExecutable,
          cmakeExecutable,
          useCmakeTools: data.useCmakeTools,
        };

        await this._executePicoProjectGenerator(
          args,
          python3Path.replace(HOME_VAR, homedir().replaceAll("\\", "/"))
        );
      } else if (example !== undefined && !this._isProjectImport) {
        const theData = data as SubmitExampleMessageValue;
        const args: NewExampleBasedProjectOptions = {
          name: theData.example,
          libNames: example.libNames,
          projectRoot: projectPath,
          boardType: theData.boardType as BoardType,
          debugger: data.debugger === 1 ? Debugger.swd : Debugger.debugProbe,
          toolchainAndSDK: {
            toolchainVersion: selectedToolchain.version,
            toolchainPath: buildToolchainPath(selectedToolchain.version),
            sdkVersion: selectedSDK,
            sdkPath: buildSDKPath(selectedSDK),
            picotoolVersion: selectedPicotool,
            openOCDVersion: openOCDVersion,
          },
          ninjaExecutable,
          cmakeExecutable,
          useCmakeTools: data.useCmakeTools,
        };

        await this._executePicoProjectGenerator(
          args,
          python3Path.replace(HOME_VAR, homedir().replaceAll("\\", "/")),
          true
        );
      } else if (this._isProjectImport && example === undefined) {
        const args: ImportProjectOptions = {
          projectRoot: projectPath,
          toolchainAndSDK: {
            toolchainVersion: selectedToolchain.version,
            toolchainPath: buildToolchainPath(selectedToolchain.version),
            sdkVersion: selectedSDK,
            sdkPath: buildSDKPath(selectedSDK),
            picotoolVersion: selectedPicotool,
            openOCDVersion: openOCDVersion,
          },
          ninjaExecutable,
          cmakeExecutable,
          debugger: data.debugger === 1 ? Debugger.swd : Debugger.debugProbe,
          useCmakeTools: data.useCmakeTools,
        };

        await this._executePicoProjectGenerator(
          args,
          python3Path.replace(HOME_VAR, homedir().replaceAll("\\", "/"))
        );
      } else {
        progress.report({
          message: "Failed",
          increment: 100,
        });
        await window.showErrorMessage("Unknown project type.");

        return;
      }
    }
  }

  private async _update(forceCreateFromExample: boolean): Promise<void> {
    this._panel.title = this._isProjectImport
      ? "Import Pico Project"
      : forceCreateFromExample
      ? "New Example Pico Project"
      : "New Pico Project";
    this._panel.iconPath = Uri.joinPath(
      this._extensionUri,
      "web",
      "raspberry-128.png"
    );
    const html = await this._getHtmlForWebview(
      this._panel.webview,
      forceCreateFromExample
    );

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
        "Failed to load available Pico SDKs and/or supported toolchains. This may be due to an outdated personal access token for GitHub or a exceeded rate limit."
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
    NewProjectPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();

      if (x) {
        x.dispose();
      }
    }
  }

  private async _getHtmlForWebview(
    webview: Webview,
    forceCreateFromExample: boolean
  ): Promise<string> {
    // TODO: store in memory so on future update static stuff doesn't need to be read again
    const mainScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "main.js")
    );
    const navScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "nav.js")
    );
    const stateScriptUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "state.js")
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

    const navHeaderDarkSvgUri = webview.asWebviewUri(
      Uri.joinPath(this._extensionUri, "web", "raspberrypi-nav-header-dark.svg")
    );

    const riscvWhiteSvgUri = webview.asWebviewUri(
      Uri.joinPath(
        this._extensionUri,
        "web",
        "riscv",
        "RISC-V_Horizontal_White.svg"
      )
    );
    const riscvWhiteYellowSvgUri = webview.asWebviewUri(
      Uri.joinPath(
        this._extensionUri,
        "web",
        "riscv",
        "RISC-V_Horizontal_White_Yellow.svg"
      )
    );
    const riscvBlackSvgUri = webview.asWebviewUri(
      Uri.joinPath(
        this._extensionUri,
        "web",
        "riscv",
        "RISC-V_Horizontal_Black.svg"
      )
    );
    const riscvColorSvgUri = webview.asWebviewUri(
      Uri.joinPath(
        this._extensionUri,
        "web",
        "riscv",
        "RISC-V_Horizontal_Color.svg"
      )
    );

    const defaultTheme =
      window.activeColorTheme.kind === ColorThemeKind.Dark ||
      window.activeColorTheme.kind === ColorThemeKind.HighContrast
        ? "dark"
        : "light";
    const riscvDefaultSvgUri = defaultTheme === "dark" ? riscvWhiteSvgUri : riscvBlackSvgUri;

    this._versionBundlesLoader = new VersionBundlesLoader(this._extensionUri);

    // construct auxiliary html
    // TODO: add offline handling - only load installed ones
    let toolchainsHtml = "";
    let picoSDKsHtml = "";
    let picotoolsHtml = "";
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
      const picotoolReleases = await getPicotoolReleases();

      if (availableSDKs.length === 0 || supportedToolchains.length === 0) {
        this._logger.error(
          "Failed to load toolchains or SDKs. This may be due to an outdated personal access token for GitHub."
        );

        throw new Error("Failed to load toolchains or SDKs.");
      }

      this._versionBundle = await this._versionBundlesLoader.getModuleVersion(
        availableSDKs[0]
      );

      // Remove newer SDKs without version bundles
      while (this._versionBundle === undefined && availableSDKs.length > 1) {
        availableSDKs.shift();
        this._versionBundle = await this._versionBundlesLoader.getModuleVersion(
          availableSDKs[0]
        );
      }

      availableSDKs
        .sort((a, b) => compare(b, a))
        .forEach(sdk => {
          picoSDKsHtml += `<option ${
            picoSDKsHtml.length === 0 ? "selected " : ""
          }value="${sdk}" ${
            compare(sdk, "1.5.0") < 0
              ? `class="advanced-option-2" disabled`
              : ""
          }>v${sdk}</option>`;
        });

      picotoolReleases
        .sort((a, b) => compare(b, a))
        .forEach(picotool => {
          picotoolsHtml += `<option ${
            picotoolsHtml.length === 0 ? "selected " : ""
          }value="${picotool}">${picotool}</option>`;
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
        .sort((a, b) => compare(b.replace("v", ""), a.replace("v", "")))
        .forEach(ninja => {
          ninjasHtml += `<option ${
            ninjasHtml.length === 0 ? "selected " : ""
          }value="${ninja}">${ninja}</option>`;
        });

      cmakeReleases.forEach(cmake => {
        cmakesHtml += `<option ${
          cmakesHtml.length === 0 ? "selected " : ""
        }value="${cmake}">${cmake}</option>`;
      });

      if (
        toolchainsHtml.length === 0 ||
        picoSDKsHtml.length === 0 ||
        (process.platform !== "linux" && ninjasHtml.length === 0)
      ) {
        this._logger.error(
          "Failed to load toolchains or SDKs. This may be due to an outdated personal access token for GitHub."
        );

        throw new Error("Failed to load toolchains or SDKs.");
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

      this.dispose();
      void window.showErrorMessage(
        "Error while retrieving SDK and toolchain versions."
      );

      return "";
    }

    const isNinjaSystemAvailable =
      (await which("ninja", { nothrow: true })) !== null;
    const isCmakeSystemAvailable =
      (await which("cmake", { nothrow: true })) !== null;

    if (!isNinjaSystemAvailable && NINJA_AUTO_INSTALL_DISABLED) {
      this.dispose();
      await window.showErrorMessage(
        "Not all requirements are met. Automatic ninja installation is currently not supported on aarch64 Linux systems. Please install ninja manually."
      );

      return "";
    }

    this._examples = await loadExamples();
    this._logger.info(`Loaded ${this._examples.length} examples.`);

    // Restrict the webview to only load specific scripts
    const nonce = getNonce();
    const isWindows = process.platform === "win32";
    const useProjectNameAsEntryPointFileName =
      this._settings.getEntryPointNamingPref();

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

        <title>${
          this._isProjectImport
            ? "Import Pico Project"
            : forceCreateFromExample
            ? "New Example Pico Project"
            : "New Pico Project"
        }</title>

        <script nonce="${nonce}" src="${tailwindcssScriptUri.toString()}"></script>
        <script nonce="${nonce}">
          tailwind.config = {
            darkMode: 'class',
          }
          ${
            !this._isProjectImport && this._examples.length > 0
              ? `
          var examples = {${this._examples
            .map(
              e =>
                `"${e.searchKey}": {"boards": [${e.boards
                  .map(b => `"${b}"`)
                  .join(", ")}], "supportRiscV": ${e.supportRiscV}}`
            )
            .join(", ")}};`
              : ""
          }
          var doProjectImport = ${this._isProjectImport};
          var forceCreateFromExample = ${forceCreateFromExample};

          localStorage.theme = "${defaultTheme}";

          // riscv logos
          const riscvWhiteSvgUri = "${riscvWhiteSvgUri.toString()}";
          const riscvWhiteYellowSvgUri = "${riscvWhiteYellowSvgUri.toString()}";
          const riscvBlackSvgUri = "${riscvBlackSvgUri.toString()}";
          const riscvColorSvgUri = "${riscvColorSvgUri.toString()}";
        </script>
      </head>
      <body class="scroll-smooth w-screen${defaultTheme === "dark" ? " dark" : ""}">
        <div id="above-nav" class="container max-w-6xl mx-auto flex justify-between items-center w-full sticky top-0 z-10 pl-5 h-5">
        </div>
        <div id="nav-overlay" class="overlay hidden md:hidden inset-y-0 right-0 w-auto z-50 overflow-y-auto ease-out bg-slate-400 dark:bg-slate-800 drop-shadow-lg">
          <!-- Navigation links go here -->
          <ul class="overlay-menu">
            <li id="ov-nav-basic" class="overlay-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Basic Settings</li>
            ${
              !this._isProjectImport
                ? `
            <li id="ov-nav-features" class="overlay-item project-options text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Features</li>
            <li id="ov-nav-stdio" class="overlay-item project-options text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Stdio support</li>
            <li id="ov-nav-pico-wireless" class="overlay-item project-options hidden text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Pico wireless options</li>
            <li id="ov-nav-code-gen" class="overlay-item project-options text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Code generation options</li>
            `
                : ""
            }
            <li id="ov-nav-debugger" class="overlay-item text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md">Debugger</li>
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
                ${
                  !this._isProjectImport
                    ? `
                <li class="nav-item project-options text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-features">
                    Features
                </li>
                <li class="nav-item project-options text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-stdio">
                    Stdio support
                </li>
                <li class="nav-item project-options hidden text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-pico-wireless">
                    Pico wireless options
                </li>
                <li class="nav-item project-options text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-code-gen">
                    Code generation options
                </li>
                `
                    : ""
                }
                <li class="nav-item text-black dark:text-white max-h-14 text-lg flex items-center cursor-pointer p-2 hover:bg-slate-500 hover:bg-opacity-50 dark:hover:bg-slate-600 hover:shadow-md transition-colors motion-reduce:transition-none ease-in-out rounded-md" id="nav-debugger">
                    Debugger
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
                  ${
                    !this._isProjectImport
                      ? `<div id="project-name-grid" class="grid gap-6 ${
                          // removed/added dynamic in nav.js
                          !forceCreateFromExample ? "md:grid-cols-2" : ""
                        }">
                        <div>
                          <label for="inp-project-name" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Name</label>
                          <div class="flex">
                            <div class="relative inline-flex w-full">
                                <input type="text" id="inp-project-name" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 invalid:border-pink-500 invalid:text-pink-600 focus:invalid:border-pink-500 focus:invalid:ring-pink-500" placeholder="${
                                  forceCreateFromExample
                                    ? "Select an example"
                                    : "Project name"
                                }" required/> <!-- without this required the webview will crash every time you hit the examples button -->
                                <button id="project-name-dropdown-button" class="absolute inset-y-0 right-0 flex items-center px-2 border bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-r-lg border-gray-300 dark:border-gray-600 ${
                                  !forceCreateFromExample ? "hidden" : ""
                                }">&#9660;</button>
                                ${
                                  this._examples.length > 0
                                    ? `   
                                    <ul id="examples-list" class="bg-gray-50 border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-b-lg"></ul>                          
                                <!--<datalist id="examples-list">
                                  <option value="\${this._examples
                                    .map(e => e.searchKey)
                                    .join(
                                      '">example project</option>\n<option value="'
                                    )}">example project</option>
                                </datalist>-->`
                                    : ""
                                }
                            </div>
                            <button id="btn-create-from-example" class="focus:outline-none bg-transparent ring-2 focus:ring-3 ring-blue-400 dark:ring-blue-700 font-medium rounded-lg px-4 ml-4 hover:bg-blue-500 dark:hover:bg-blue-700 focus:ring-blue-600 dark:focus:ring-blue-800" tooltip="Create from example">Example</button>
                          </div>

                          <p id="inp-project-name-error" class="mt-2 text-sm text-red-600 dark:text-red-500" hidden>
                              <span class="font-medium">Error</span> Please enter a valid project name.
                          </p>
                        </div>
                
                        <div id="board-type-riscv-grid" class="grid gap-6 grid-cols-2">
                          <div>
                            <label for="sel-board-type" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Board type</label>
                            <select id="sel-board-type" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                             <option id="option-board-type-${
                               BoardType.pico2
                             }" value="${BoardType.pico2}">Pico 2</option>    
                              <option id="option-board-type-${
                                BoardType.pico
                              }" value="${BoardType.pico}">Pico</option>
                              <option id="option-board-type-${
                                BoardType.picoW
                              }" value="${BoardType.picoW}">Pico W</option>
                              <option id="option-board-type-${
                                BoardType.pico2W
                              }" value="${BoardType.pico2W}">Pico 2 W</option>
                              <option id="option-board-type-${
                                BoardType.other
                              }" value="${BoardType.other}">Other</option>
                            </select>
                          </div>
                          <div class="use-riscv text-sm font-medium text-gray-900 dark:text-white" hidden>
                            <label for="riscvToggle" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Architecture (Pico 2)</label>
                            <div class="flex items-center justify-between p-2 bg-gray-100 rounded-lg dark:bg-gray-700">
                              <input type="checkbox" id="sel-riscv" class="ms-2" />
                              <img id="riscvIcon" src="${riscvDefaultSvgUri.toString()}" alt="RISC-V Logo" class="h-6 mx-auto w-28">
                            </div>
                          </div>
                        </div>
                      </div>`
                      : `<h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Warning: Project Import Wizard may not work for all projects, and will often require manual correction after the import
                        </h3>`
                  }
                    <div class="mt-6 mb-4">
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
                                  !this._isProjectImport
                                    ? isWindows
                                      ? "C:\\MyProject"
                                      : "/home/user/myproject"
                                    : isWindows
                                    ? "C:\\Project\\To\\Import"
                                    : "/project/to/import"
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
                    <div class="grid gap-6 md:grid-cols-2 mt-6">
                      <div id="pico-sdk-selector">
                        <label for="sel-pico-sdk" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Select Pico SDK version</label>
                        <select id="sel-pico-sdk" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                            ${picoSDKsHtml}
                        </select>
                      </div>
                      
                      <div class="advanced-option" hidden>
                        <label for="sel-toolchain" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Select ARM/RISCV Embedded Toolchain version</label>
                        <select id="sel-toolchain" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                            ${toolchainsHtml}
                        </select>
                      </div>
                      <div hidden>
                        <label for="sel-picotool" class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Select picotool version</label>
                        <select id="sel-picotool" class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500">
                            ${picotoolsHtml}
                        </select>
                      </div>
                    </div>
                    <div class="grid gap-6 md:grid-cols-${
                      process.platform === "darwin" ||
                      process.platform === "win32"
                        ? "6"
                        : "4"
                    } mt-6 advanced-option" hidden>
                      ${
                        !NINJA_AUTO_INSTALL_DISABLED
                          ? `<div class="col-span-2">
                        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Ninja Version:</label>

                        ${
                          // TODO: use versionBundleAvailableTest instead of this._versionBundle !== undefined cause if a version with bundle is later selected this section wouldn't be present
                          this._versionBundle !== undefined
                            ? `<div class="flex items-center mb-2">
                                <input type="radio" id="ninja-radio-default-version" name="ninja-version-radio" value="0" class="mr-1 text-blue-500 requires-version-bundle">
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
                      </div>`
                          : ""
                      }
                    
                      <div class="col-span-2">
                        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white">CMake Version:</label>

                        ${
                          this._versionBundle !== undefined
                            ? `<div class="flex items-center mb-2">
                                <input type="radio" id="cmake-radio-default-version" name="cmake-version-radio" value="0" class="mr-1 text-blue-500 requires-version-bundle">
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
            </div>
            ${
              !this._isProjectImport
                ? `<div id="section-features" class="snap-start mt-10 project-options">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">Features</h3>
                <h4 class="text-sm text-gray-900 dark:text-white mb-8">Add example code snippets to demonstrate use of these features</h4>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="spi-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="spi-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">SPI</label>
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
                            <input id="uart-example-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="uart-example-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">UART</label>
                        </div>
                    </li>
                </ul>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="pio-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="pio-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">PIO interface</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="dma-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="dma-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">DMA support</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwinterpolation-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwinterpolation-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW interpolation</label>
                        </div>
                    </li>
                </ul>
                <ul class="items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwwatchdog-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwwatchdog-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW watchdog</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwtimer-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwtimer-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW timer</label>
                        </div>
                    </li>
                    <li class="w-full dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="hwclocks-features-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="hwclocks-features-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">HW clocks</label>
                        </div>
                    </li>
                </ul>
            </div>
            `
                : ""
            }
            ${
              !this._isProjectImport
                ? `<div id="section-stdio" class="snap-start mt-10 project-options">
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
            <div id="section-pico-wireless" class="snap-start mt-10 project-options" hidden>
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
            <div id="section-code-gen" class="snap-start mt-10 project-options">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Code generation options</h3>
                <ul class="mb-2 items-center w-full text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg sm:flex dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="run-from-ram-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500">
                            <label for="run-from-ram-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Run the program from RAM rather than flash</label>
                        </div>
                    </li>
                    <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
                        <div class="flex items-center pl-3">
                            <input id="entry-project-name-code-gen-cblist" type="checkbox" value="" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500" ${
                              useProjectNameAsEntryPointFileName
                                ? "checked"
                                : ""
                            }>
                            <label for="entry-project-name-code-gen-cblist" class="w-full py-3 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Use project name as entry point file name</label>
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
                  <li class="w-full border-b border-gray-200 sm:border-b-0 sm:border-r dark:border-gray-600">
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
            </div>`
                : ""
            }
            
            <div class="grid gap-6 grid-cols-3 mt-10">
                <div id="section-debugger" class="snap-start col-span-2">
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">Debugger</h3>
                    <div class="flex items-stretch space-x-4">
                        <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                            <input checked id="debugger-radio-debug-probe" type="radio" value="0" name="debugger-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                            <label for="debugger-radio-debug-probe" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">DebugProbe (CMSIS-DAP) [Default]</label>
                        </div>
                        <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                            <input id="debugger-radio-swd" type="radio" value="1" name="debugger-radio" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                            <label for="debugger-radio-swd" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">SWD (Pi host, on Pi 5 it requires Linux Kernel >= 6.6.47)</label>
                        </div>
                    </div>
                </div>
                <div id="section-extension-integration" class="snap-end advanced-option" hidden>
                  <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-8">CMake Tools</h3>
                  <div class="flex items-stretch space-x-4">
                      <div class="flex items-center px-4 py-2 border border-gray-200 rounded dark:border-gray-700">
                          <input id="use-cmake-tools-cb" type="checkbox" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 outline-none focus:ring-0 focus:ring-offset-5 dark:bg-gray-700 dark:border-gray-600">
                          <label for="use-cmake-tools-cb" class="w-full py-4 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">Enable CMake-Tools extension integration</label>
                      </div>
                  </div>
                </div>
            </div>
            <div class="bottom-3 mt-8 mb-12 w-full flex justify-end">
                <button id="btn-advanced-options" class="focus:outline-none bg-transparent ring-2 focus:ring-4 ring-yellow-400 dark:ring-yellow-700 font-medium rounded-lg text-lg px-4 py-2 mr-4 hover:bg-yellow-500 dark:hover:bg-yellow-700 focus:ring-yellow-600 dark:focus:ring-yellow-800">Show Advanced Options</button>
                <button id="btn-cancel" class="focus:outline-none bg-transparent ring-2 focus:ring-4 ring-red-400 dark:ring-red-700 font-medium rounded-lg text-lg px-4 py-2 mr-4 hover:bg-red-500 dark:hover:bg-red-700 focus:ring-red-600 dark:focus:ring-red-800">Cancel</button>
                <button id="btn-create" class="focus:outline-none bg-transparent ring-2 focus:ring-4 ring-green-400 dark:ring-green-700 font-medium rounded-lg text-lg px-4 py-2 mr-2 hover:bg-green-500 dark:hover:bg-green-700 focus:ring-green-600 dark:focus:ring-green-800">
                  ${this._isProjectImport ? "Import" : "Create"}
                </button>
            </div>
        </main>

        <script nonce="${nonce}" src="${navScriptUri.toString()}"></script>
        <script nonce="${nonce}" src="${stateScriptUri.toString()}"></script>
        <script nonce="${nonce}" src="${mainScriptUri.toString()}"></script>
      </body>
    </html>`;
  }

  private _runGenerator(
    command: string,
    options: ExecOptions
  ): Promise<number | null> {
    return new Promise<number | null>(resolve => {
      const generatorProcess = exec(
        command,
        options,
        (error, stdout, stderr) => {
          this._logger.debug(stdout);
          this._logger.info(stderr);
          if (error) {
            this._logger.error(`Generator Process error: ${error.message}`);
            resolve(null); // indicate error
          }
        }
      );

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
    options:
      | NewProjectOptions
      | NewExampleBasedProjectOptions
      | ImportProjectOptions,
    pythonExe: string,
    isExampleBased: boolean = false
  ): Promise<void> {
    const isWindows = process.platform === "win32";

    // convert the selected board type to a valid option
    // for the project generator
    let boardTypeFromEnum = "";
    if ("boardType" in options) {
      try {
        boardTypeFromEnum = await enumToBoard(
          options.boardType,
          options.toolchainAndSDK.sdkPath
        );
      } catch {
        await window.showErrorMessage(
          "Unknown board type: " + options.boardType
        );

        return;
      }
    }

    const basicNewProjectOptions: string[] =
      "consoleOptions" in options
        ? [
            boardTypeFromEnum,
            ...options.consoleOptions.map(option => enumToParam(option)),
            !options.consoleOptions.includes(ConsoleOption.consoleOverUART)
              ? "-nouart"
              : "",
          ]
        : "boardType" in options
        ? [boardTypeFromEnum]
        : [];
    if (!("boardType" in options) && this._isProjectImport) {
      try {
        const cmakel = await readFile(
          this._isProjectImport
            ? join(options.projectRoot, "CMakeLists.txt")
            : join(
                options.projectRoot,
                (options as NewExampleBasedProjectOptions).name,
                "CMakeLists.txt"
              ),
          "utf-8"
        );
        const match = /set\(PICO_BOARD ([A-Za-z_0-9]+) /.exec(cmakel);
        if (match && match[1]) {
          basicNewProjectOptions.push(`-board ${match[1]}`);
        }
      } catch {
        /* ignore */
      }
    } else if (
      "boardType" in options &&
      isExampleBased &&
      "name" in options &&
      "libNames" in options
    ) {
      for (const libName of options.libNames) {
        basicNewProjectOptions.push(`-examLibs ${libName}`);
      }
    }

    const libraryAndCodeGenerationOptions: string[] =
      "libraries" in options && "codeOptions" in options
        ? [
            ...options.libraries.map(option => enumToParam(option)),
            ...options.codeOptions.map(option => enumToParam(option)),
          ]
        : "name" in options // no libraries and codeOptions but name means it's an example based project
        ? ["-exam"]
        : // no libraries and codeOptions and no name means it's an imported project
          ["-conv"];

    const projectName =
      "name" in options
        ? options.name
        : // no name in options means importing project so the folder name is assumed to be the project name
          options.projectRoot.substring(
            options.projectRoot.lastIndexOf("/") + 1
          );

    const command: string = [
      // TODO: maybe use includes powershell instead of .exe and ===
      `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
      `"${joinPosix(getScriptsRoot(), "pico_project.py")}"`,
      ...basicNewProjectOptions,
      ...libraryAndCodeGenerationOptions,
      enumToParam(options.debugger),
      // generate .vscode config
      "--project",
      "vscode",
      "--projectRoot",
      // cause import project not the project root but the project folder is selected
      `"${
        this._isProjectImport
          ? options.projectRoot.substring(
              0,
              options.projectRoot.lastIndexOf("/")
            )
          : isWindows
          ? options.projectRoot
          : options.projectRoot.replaceAll("\\", "\\\\")
      }"`,
      "--userHome",
      `"${homedir().replaceAll("\\", "/")}"`,
      "--sdkVersion",
      options.toolchainAndSDK.sdkVersion,
      "--toolchainVersion",
      options.toolchainAndSDK.toolchainVersion,
      "--picotoolVersion",
      options.toolchainAndSDK.picotoolVersion,
      "--openOCDVersion",
      options.toolchainAndSDK.openOCDVersion,
      "--ninjaPath",
      `"${options.ninjaExecutable}"`,
      "--cmakePath",
      `"${options.cmakeExecutable}"`,
      options.useCmakeTools ? "-ucmt" : "",

      `"${projectName}"`,
    ].join(" ");

    this._logger.debug(`Executing project generator command: ${command}`);

    // execute command
    // TODO: use exit codes to determine why the project generator failed (if it did)
    // to be able to show the user a more detailed error message
    const generatorExitCode = await this._runGenerator(command, {
      cwd: getScriptsRoot(),
      windowsHide: true,
    });
    if (
      (process.platform === "linux" && generatorExitCode === null) ||
      generatorExitCode === 0
    ) {
      void window.showInformationMessage(
        `Successfully generated new project: ${projectName}`
      );

      const folderAlreadyOpen = workspace.workspaceFolders?.some(
        f => f.uri.fsPath === options.projectRoot
      );

      // open new folder
      void commands.executeCommand(
        "vscode.openFolder",
        Uri.file(
          this._isProjectImport
            ? options.projectRoot
            : join(options.projectRoot, projectName)
        ),
        {
          forceNewWindow: (workspace.workspaceFolders?.length ?? 0) > 0,
        }
      );

      // restart the extension if the folder was already open cause then vscode won't
      // automatically reload the window
      if (folderAlreadyOpen) {
        void commands.executeCommand("workbench.action.reloadWindow");
      }
    } else {
      this._logger.error(
        `Generator Process exited with code: ${generatorExitCode ?? "null"}`
      );

      void window.showErrorMessage(
        `Could not ${
          this._isProjectImport ? "import" : "create"
        } new project: ${projectName}`
      );
    }
  }
}

export function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}
