import { window } from "vscode";
import Command from "./command.mjs";
import Logger from "../logger.mjs";
import which from "which";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

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
      return "--board pico";
    case BoardType.picoW:
      return "--board pico_w";
    case ConsoleOptions.consoleOverUART:
      return "--uart";
    case ConsoleOptions.consoleOverUSB:
      return "--usb";
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
  boardType: BoardType;
  consoleOptions: ConsoleOptions[];
  libraries: Libraries[];
}

function getScriptsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "scripts");
}

export default class NewProjectCommand extends Command {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  // check at runtime if the OS is Windows
  private readonly _isWindows: boolean = process.platform === "win32";

  constructor() {
    super("newProject");
  }

  async execute(): Promise<void> {
    // check if all requirements are met
    if (!(await this.checkForRequirements())) {
      await window.showErrorMessage(
        "The Pico development requires Ninja, CMake and Python 3 " +
          "to be installed and available in the PATH. " +
          "Please install and restart VS Code."
      );

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

    this.executePicoProjectGenerator({
      name: selectedName,
      boardType: selectedBoardType,
      consoleOptions: selectedConsoleOptions,
      libraries: selectedLibraries,
    });
  }

  /**
   * Checks if all requirements are met to run the Pico Project Generator
   *
   * @returns true if all requirements are met, false otherwise
   */
  private async checkForRequirements(): Promise<boolean> {
    const ninja: string | null = await which("ninja", { nothrow: true });
    const cmake: string | null = await which("cmake", { nothrow: true });
    const python3: string | null = await which(
      this._isWindows ? "python3" : "python",
      { nothrow: true }
    );

    // TODO: check python version
    return ninja !== null && cmake !== null && python3 !== null;
  }

  /**
   * Executes the Pico Project Generator with the given options
   *
   * @param options {@link NewProjectOptions} to pass to the Pico Project Generator
   */
  private executePicoProjectGenerator(options: NewProjectOptions): void {
    const PICO_SDK_PATH = "";
    const COMPILER_PATH = "compiler-path/bin";
    const customEnv: { [key: string]: string } = {
      ...process.env,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PICO_SDK_PATH: PICO_SDK_PATH,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PICO_TOOLCHAIN_PATH: COMPILER_PATH,
    };
    customEnv["PATH"] = `${COMPILER_PATH}:${customEnv.PATH}`;

    const command: string = [
      "python3",
      join(getScriptsRoot(), "pico_project.py"),
      enumToParam(options.boardType),
      ...options.consoleOptions.map(option => enumToParam(option)),
      ...options.libraries.map(option => enumToParam(option)),
      options.name,
    ].join(" ");

    this._logger.debug(`Executing command: ${command}`);

    // execute command
    exec(
      command,
      {
        env: customEnv,
      },
      (error, stdout, stderr) => {
        if (error) {
          this._logger.error(`Error: ${error.message}`);

          return;
        }

        if (stderr) {
          this._logger.error(`Error: ${stderr}`);

          return;
        }

        this._logger.debug(`Output: ${stdout}`);
      }
    );
  }
}
