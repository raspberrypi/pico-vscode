import { ProgressLocation, Uri, commands, window, workspace } from "vscode";
import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { type ExecOptions, exec } from "child_process";
import { detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import type Settings from "../settings.mjs";
import {
  checkForRequirements,
  showRequirementsNotMetErrorMessage,
} from "../utils/requirementsUtil.mjs";
import { SettingsKey } from "../settings.mjs";
import { compare } from "../utils/semverUtil.mjs";
import {
  detectInstalledToolchains,
  getSupportedToolchains,
} from "../utils/toolchainUtil.mjs";
import { SDK_REPOSITORY_URL, getSDKReleases } from "../utils/githubREST.mjs";
import {
  buildSDKPath,
  buildToolchainPath,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
} from "../utils/download.mjs";

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
}

function getScriptsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
}

export default class NewProjectCommand extends Command {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  private readonly _settings: Settings;

  constructor(settings: Settings) {
    super("newProject");

    this._settings = settings;
  }

  private async selectSDKAndToolchain(): Promise<
    | {
        toolchainVersion: string;
        toolchainPath: string;
        sdkVersion: string;
        sdkPath: string;
      }
    | undefined
  > {
    const installedSDKs = detectInstalledSDKs();
    const installedToolchains = detectInstalledToolchains();

    try {
      if (installedSDKs.length === 0 || installedToolchains.length === 0) {
        // TODO: add offline handling
        const availableSDKs = await getSDKReleases();
        const supportedToolchains = await getSupportedToolchains();

        // show quick pick for sdk and toolchain
        const selectedSDK = await window.showQuickPick(
          availableSDKs.map(sdk => ({
            label: `v${sdk.tagName}`,
            sdk: sdk,
          })),
          {
            placeHolder: "Select Pico SDK version",
            title: "New Pico Project",
          }
        );

        if (selectedSDK === undefined) {
          return;
        }

        // show quick pick for toolchain version
        const selectedToolchain = await window.showQuickPick(
          supportedToolchains.map(toolchain => ({
            label: toolchain.version.replaceAll("_", "."),
            toolchain: toolchain,
          })),
          {
            placeHolder: "Select ARM Embeded Toolchain version",
            title: "New Pico Project",
          }
        );

        if (selectedToolchain === undefined) {
          return;
        }

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
                selectedSDK.sdk.tagName,
                SDK_REPOSITORY_URL
              )) ||
              !(await downloadAndInstallToolchain(selectedToolchain.toolchain))
            ) {
              Logger.log(`Failed to download and install toolchain and SDK.`);

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
        } else {
          return {
            toolchainVersion: selectedToolchain.toolchain.version,
            toolchainPath: buildToolchainPath(
              selectedToolchain.toolchain.version
            ),
            sdkVersion: selectedSDK.sdk.tagName,
            sdkPath: buildSDKPath(selectedSDK.sdk.tagName),
          };
        }
      }

      // sort installed sdks from newest to oldest
      installedSDKs.sort((a, b) =>
        compare(a.version.replace("v", ""), b.version.replace("v", ""))
      );
      // toolchains should be sorted and cant be sorted by compare because
      // of their alphanumeric structure

      return {
        toolchainVersion: installedToolchains[0].version,
        toolchainPath: installedToolchains[0].path,
        sdkVersion: installedSDKs[0].version,
        sdkPath: installedSDKs[0].sdkPath,
      };
    } catch (error) {
      Logger.log(
        `Error while retrieving SDK and toolchain versions: ${
          error instanceof Error ? error.message : (error as string)
        }`
      );

      void window.showErrorMessage(
        "Error while retrieving SDK and toolchain versions."
      );

      return;
    }
  }

  async execute(): Promise<void> {
    // check if all requirements are met
    const requirementsCheck = await checkForRequirements(this._settings);
    if (!requirementsCheck[0]) {
      void showRequirementsNotMetErrorMessage(requirementsCheck[1]);

      return;
    }

    // TODO: maybe make it posible to also select a folder and
    // not always create a new one with selectedName
    const projectRoot: Uri[] | undefined = await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select project root",
    });

    // user focused out of the quick pick
    if (!projectRoot || projectRoot.length !== 1) {
      return;
    }

    // get project name
    const selectedName: string | undefined = await window.showInputBox({
      placeHolder: "Enter a project name",
      title: "New Pico Project",
    });

    // user focused out of the quick pick
    if (!selectedName) {
      return;
    }

    // get board type (single selection)
    const selectedBoardType: BoardType | undefined =
      (await window.showQuickPick(Object.values(BoardType), {
        placeHolder: "Select a board type",
        title: "New Pico Project",
      })) as BoardType | undefined;

    // user focused out of the quick pick
    if (!selectedBoardType) {
      return;
    }

    // [optional] get console options (multi selection)
    const selectedConsoleOptions: ConsoleOption[] | undefined =
      (await window.showQuickPick(Object.values(ConsoleOption), {
        placeHolder: "Would you like to enable the USB console?",
        title: "New Pico Project",
        canPickMany: true,
      })) as ConsoleOption[] | undefined;

    // user focused out of the quick pick
    if (!selectedConsoleOptions) {
      return;
    }

    // [optional] get libraries (multi selection)
    const selectedFeatures: Array<Library | PicoWirelessOption> | undefined =
      (await window.showQuickPick(Object.values(Library), {
        placeHolder: "Select libraries to include",
        title: "New Pico Project",
        canPickMany: true,
      })) as Library[] | undefined;

    // user focused out of the quick pick
    if (!selectedFeatures) {
      return;
    }

    if (selectedBoardType === BoardType.picoW) {
      const selectedWirelessFeature: PicoWirelessOption | undefined =
        (await window.showQuickPick(Object.values(PicoWirelessOption), {
          placeHolder:
            "Select wireless features to include or press enter to skip",
          title: "New Pico Project",
          canPickMany: false,
        })) as PicoWirelessOption | undefined;

      // user focused out of the quick pick
      if (!selectedWirelessFeature) {
        return;
      }

      if (
        selectedWirelessFeature &&
        selectedWirelessFeature !== PicoWirelessOption.none
      ) {
        selectedFeatures.push(selectedWirelessFeature);
      }
    }

    const selectedCodeOptions: CodeOption[] | undefined =
      (await window.showQuickPick(Object.values(CodeOption), {
        placeHolder: "Select code generator options to use",
        title: "New Pico Project",
        canPickMany: true,
      })) as CodeOption[] | undefined;

    if (!selectedCodeOptions) {
      return;
    }

    const selectedDebugger: Debugger | undefined = (await window.showQuickPick(
      Object.values(Debugger),
      {
        placeHolder: "Select debugger to use",
        title: "New Pico Project",
        canPickMany: false,
      }
    )) as Debugger | undefined;

    if (!selectedDebugger) {
      return;
    }

    const selectedToolchainAndSDK = await this.selectSDKAndToolchain();

    if (selectedToolchainAndSDK === undefined) {
      return;
    }

    void window.showWarningMessage(
      "Generating project, this may take a while. " +
        "For linting and auto-complete to work, " +
        "please completly restart VSCode after the project has been generated."
    );

    await this.executePicoProjectGenerator({
      name: selectedName,
      projectRoot: projectRoot[0].fsPath,
      boardType: selectedBoardType,
      consoleOptions: selectedConsoleOptions,
      libraries: selectedFeatures,
      codeOptions: selectedCodeOptions,
      debugger: selectedDebugger,
      toolchainAndSDK: selectedToolchainAndSDK,
    });
  }

  private runGenerator(
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

  /**
   * Executes the Pico Project Generator with the given options.
   *
   * @param options {@link NewProjectOptions} to pass to the Pico Project Generator
   */
  private async executePicoProjectGenerator(
    options: NewProjectOptions
  ): Promise<void> {
    const customEnv: { [key: string]: string } = {
      ...(process.env as { [key: string]: string }),
      // set PICO_SDK_PATH
      ["PICO_SDK_PATH"]: options.toolchainAndSDK.sdkPath,
      // set PICO_TOOLCHAIN_PATH i needed someday
      ["PICO_TOOLCHAIN_PATH"]: options.toolchainAndSDK.toolchainPath,
    };
    // add compiler to PATH
    const isWindows = process.platform === "win32";
    customEnv[isWindows ? "Path" : "PATH"] = `${join(
      options.toolchainAndSDK.toolchainPath,
      "bin"
    )}${isWindows ? ";" : ":"}${customEnv[isWindows ? "Path" : "PATH"]}`;
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
      options.name,
    ].join(" ");

    this._logger.debug(`Executing project generator command: ${command}`);

    // execute command
    // TODO: use exit codes to determine why the project generator failed (if it did)
    // to be able to show the user a more detailed error message
    const generatorExitCode = await this.runGenerator(command, {
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
