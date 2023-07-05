import { Uri, commands, window } from "vscode";
import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { type ExecOptions, exec } from "child_process";
import { detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import type Settings from "../settings.mjs";
import {
  checkForRequirements,
  showRquirementsNotMetErrorMessage,
} from "../utils/requirementsUtil.mjs";
import { redirectVSCodeConfig } from "../utils/vscodeConfigUtil.mjs";
import { compare } from "semver";
import { SettingsKey } from "../settings.mjs";

enum BoardType {
  pico = "Pico",
  picoW = "Pico W",
}

enum ConsoleOptions {
  consoleOverUART = "Console over UART",
  consoleOverUSB = "Console over USB (disables other USB use)",
}

enum Libraries {
  spi = "SPI",
  i2c = "I2C",
  dma = "DMA support",
  pio = "PIO",
  interp = "HW interpolation",
  timer = "HW timer",
  watch = "HW watchdog",
  clocks = "HW clocks",
}

function enumToParam(e: BoardType | ConsoleOptions | Libraries): string {
  switch (e) {
    case BoardType.pico:
      return "-board pico";
    case BoardType.picoW:
      return "-board pico_w";
    case ConsoleOptions.consoleOverUART:
      return "-uart";
    case ConsoleOptions.consoleOverUSB:
      return "-usb";
    case Libraries.spi:
      return "-f spi";
    case Libraries.i2c:
      return "-f i2c";
    case Libraries.dma:
      return "-f dma";
    case Libraries.pio:
      return "-f pio";
    case Libraries.interp:
      return "-f interp";
    case Libraries.timer:
      return "-f timer";
    case Libraries.watch:
      return "-f watch";
    case Libraries.clocks:
      return "-f clocks";
    default:
      throw new Error(`Unknown enum value: ${e as string}`);
  }
}

interface NewProjectOptions {
  name: string;
  projectRoot: string;
  boardType: BoardType;
  consoleOptions: ConsoleOptions[];
  libraries: Libraries[];
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

  async execute(): Promise<void> {
    // check if all requirements are met
    if (!(await checkForRequirements(this._settings))) {
      void showRquirementsNotMetErrorMessage();

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

    if (!projectRoot || projectRoot.length !== 1) {
      return;
    }

    // get project name
    const selectedName: string | undefined = await window.showInputBox({
      placeHolder: "Enter a project name",
      title: "New Pico Project",
    });

    if (!selectedName) {
      return;
    }

    // get board type (single selection)
    const selectedBoardType: BoardType | undefined =
      (await window.showQuickPick(Object.values(BoardType), {
        placeHolder: "Select a board type",
        title: "New Pico Project",
      })) as BoardType | undefined;

    if (!selectedBoardType) {
      return;
    }

    // [optional] get console options (multi selection)
    const selectedConsoleOptions: ConsoleOptions[] | undefined =
      (await window.showQuickPick(Object.values(ConsoleOptions), {
        placeHolder: "Would you like to enable the USB console?",
        title: "New Pico Project",
        canPickMany: true,
      })) as ConsoleOptions[] | undefined;

    if (!selectedConsoleOptions) {
      return;
    }

    // [optional] get libraries (multi selection)
    const selectedLibraries: Libraries[] | undefined =
      (await window.showQuickPick(Object.values(Libraries), {
        placeHolder: "Select libraries to include",
        title: "New Pico Project",
        canPickMany: true,
      })) as Libraries[] | undefined;

    if (!selectedLibraries) {
      return;
    }

    await this.executePicoProjectGenerator({
      name: selectedName,
      projectRoot: projectRoot[0].fsPath,
      boardType: selectedBoardType,
      consoleOptions: selectedConsoleOptions,
      libraries: selectedLibraries,
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
   * Executes the Pico Project Generator with the given options
   *
   * @param options {@link NewProjectOptions} to pass to the Pico Project Generator
   */
  private async executePicoProjectGenerator(
    options: NewProjectOptions
  ): Promise<void> {
    /*const [PICO_SDK_PATH, COMPILER_PATH] = (await getSDKAndToolchainPath(
      this._settings
    )) ?? [];*/
    const installedSDKs = detectInstalledSDKs().sort((a, b) =>
      compare(a.version, b.version)
    );

    if (installedSDKs.length === 0) {
      void window.showErrorMessage(
        "Could not find Pico SDK or Toolchain. Please check the wiki."
      );

      return;
    }

    const PICO_SDK_PATH = installedSDKs[0].sdkPath;
    const TOOLCHAIN_PATH = installedSDKs[0].toolchainPath;

    const customEnv: { [key: string]: string } = {
      ...process.env,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PICO_SDK_PATH: PICO_SDK_PATH,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PICO_TOOLCHAIN_PATH: TOOLCHAIN_PATH,
    };
    customEnv[
      process.platform === "win32" ? "Path" : "PATH"
    ] = `${TOOLCHAIN_PATH}:${
      customEnv[process.platform === "win32" ? "Path" : "PATH"]
    }`;
    const pythonExe =
      this._settings.getString(SettingsKey.python3Path) ??
      process.platform === "win32"
        ? "python"
        : "python3";

    const command: string = [
      pythonExe,
      join(getScriptsRoot(), "pico_project.py"),
      enumToParam(options.boardType),
      ...options.consoleOptions.map(option => enumToParam(option)),
      !options.consoleOptions.includes(ConsoleOptions.consoleOverUART)
        ? "-nouart"
        : "",
      ...options.libraries.map(option => enumToParam(option)),
      // generate .vscode config
      "--project",
      "vscode",
      "--projectRoot",
      `"${options.projectRoot}"`,
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
      timeout: 5000,
    });
    if (generatorExitCode === 0) {
      await redirectVSCodeConfig(
        join(options.projectRoot, options.name, ".vscode"),
        this._settings.getExtensionId(),
        this._settings.getExtensionName(),
        TOOLCHAIN_PATH,
        installedSDKs[0].version
      );
      void window.showInformationMessage(
        `Successfully created project: ${options.name}`
      );
      // open new folder
      void commands.executeCommand(
        "vscode.openFolder",
        Uri.file(join(options.projectRoot, options.name)),
        true
      );
    } else {
      this._logger.error(
        `Generator Process exited with code: ${generatorExitCode ?? "null"}`
      );

      void window.showErrorMessage(`Could not create project ${options.name}`);
    }
  }
}
