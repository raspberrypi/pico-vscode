import { rmSync } from "fs";
import { CommandWithResult } from "./command.mjs";
import { commands, type Uri, window, workspace } from "vscode";
import { type ExecOptions, exec } from "child_process";
import { join as joinPosix } from "path/posix";
import { homedir } from "os";
import {
  getPythonPath,
  getPath,
  cmakeGetSelectedToolchainAndSDKVersions,
  cmakeGetPicoVar,
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { join as joinPosix } from "path/posix";
import {
  buildOpenOCDPath,
  buildPicotoolPath,
  buildSDKPath,
  buildToolchainPath,
  buildWestPath,
  buildZephyrWorkspacePath,
  downloadAndInstallArchive,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadFileGot,
} from "../utils/download.mjs";
import Settings, { SettingsKey, HOME_VAR } from "../settings.mjs";
import which from "which";
import { execSync } from "child_process";
import { getPicotoolReleases } from "../utils/githubREST.mjs";
import State from "../state.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import Logger from "../logger.mjs";
import { rustProjectGetSelectedChip } from "../utils/rustUtil.mjs";
import { OPENOCD_VERSION } from "../utils/sharedConstants.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import { ensureGit } from "../utils/gitUtil.mjs";

export class GetPythonPathCommand extends CommandWithResult<string> {
  constructor() {
    super("getPythonPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const pythonPath = await getPythonPath();

    return pythonPath;
  }
}

export class GetEnvPathCommand extends CommandWithResult<string> {
  constructor() {
    super("getEnvPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const path = await getPath();

    return path;
  }
}

export class GetGDBPathCommand extends CommandWithResult<string> {
  constructor(private readonly _extensionUri: Uri) {
    super("getGDBPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];
    const isRustProject = State.getInstance().isRustProject;
    let toolchainVersion = "";

    if (isRustProject) {
      // check if latest toolchain is installed
      const vbl = new VersionBundlesLoader(this._extensionUri);
      const latestVb = await vbl.getLatest();

      if (!latestVb) {
        void window.showErrorMessage("No version bundles found.");

        return "";
      }

      const supportedToolchains = await getSupportedToolchains();
      const latestSupportedToolchain = supportedToolchains.find(
        t => t.version === latestVb[1].toolchain
      );
      if (!latestSupportedToolchain) {
        void window.showErrorMessage(
          "No supported toolchain found for the latest version."
        );

        return "";
      }

      const useRISCV = rustProjectGetSelectedChip(
        workspaceFolder.uri.fsPath
      )?.includes("riscv");

      toolchainVersion = useRISCV
        ? latestVb[1].riscvToolchain
        : latestVb[1].toolchain;
    } else {
      const selectedToolchainAndSDKVersions =
        await cmakeGetSelectedToolchainAndSDKVersions(workspaceFolder.uri);
      if (selectedToolchainAndSDKVersions === null) {
        return "";
      }

      toolchainVersion = selectedToolchainAndSDKVersions[1];
    }

    let triple = "arm-none-eabi";
    if (toolchainVersion.includes("RISCV")) {
      if (toolchainVersion.includes("COREV")) {
        triple = "riscv32-corev-elf";
      } else {
        triple = "riscv32-unknown-elf";
      }
    } else if (process.platform === "linux") {
      // Arm toolchains have incorrect libncurses versions on Linux (specifically RPiOS)
      const gdbPath = await which("gdb", { nothrow: true });
      if (gdbPath !== null) {
        // Test if system gdb supports arm_any architecture - throws an error if it's not available
        try {
          execSync(`"${gdbPath}" --batch -ex "set arch arm_any"`, {
            stdio: "pipe",
          });

          return "gdb";
        } catch {
          //pass
        }
      }
      // Default to gdb on arm64
      if (process.arch === "arm64") {
        return "gdb";
      } else {
        return "gdb-multiarch";
      }
    }

    return join(buildToolchainPath(toolchainVersion), "bin", triple + "-gdb");
  }
}

export class GetCompilerPathCommand extends CommandWithResult<string> {
  constructor() {
    super("getCompilerPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];

    const selectedToolchainAndSDKVersions =
      await cmakeGetSelectedToolchainAndSDKVersions(workspaceFolder.uri);
    if (selectedToolchainAndSDKVersions === null) {
      return "";
    }
    const toolchainVersion = selectedToolchainAndSDKVersions[1];

    let triple = "arm-none-eabi";
    if (toolchainVersion.includes("RISCV")) {
      if (toolchainVersion.includes("COREV")) {
        triple = "riscv32-corev-elf";
      } else {
        triple = "riscv32-unknown-elf";
      }
    }

    return join(
      buildToolchainPath(toolchainVersion),
      "bin",
      triple + `-gcc${process.platform === "win32" ? ".exe" : ""}`
    );
  }
}

export class GetCxxCompilerPathCommand extends CommandWithResult<string> {
  constructor() {
    super("getCxxCompilerPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];

    const selectedToolchainAndSDKVersions =
      await cmakeGetSelectedToolchainAndSDKVersions(workspaceFolder.uri);
    if (selectedToolchainAndSDKVersions === null) {
      return "";
    }
    const toolchainVersion = selectedToolchainAndSDKVersions[1];

    let triple = "arm-none-eabi";
    if (toolchainVersion.includes("RISCV")) {
      if (toolchainVersion.includes("COREV")) {
        triple = "riscv32-corev-elf";
      } else {
        triple = "riscv32-unknown-elf";
      }
    }

    return join(
      buildToolchainPath(toolchainVersion),
      "bin",
      triple + `-g++${process.platform === "win32" ? ".exe" : ""}`
    );
  }
}

export class GetChipCommand extends CommandWithResult<string> {
  private readonly _logger = new Logger("GetChipCommand");

  public static readonly id = "getChip";

  constructor() {
    super(GetChipCommand.id);
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];
    const isRustProject = State.getInstance().isRustProject;

    if (isRustProject) {
      // read .pico-rs
      const chip = rustProjectGetSelectedChip(workspaceFolder.uri.fsPath);
      if (chip === null) {
        this._logger.error("Failed to read .pico-rs");

        return "";
      }

      switch (chip) {
        case "rp2040":
          return "rp2040";
        case "rp2350":
        case "rp2350-riscv":
          return "rp235x";
        default:
          return "rp2040";
      }
    }

    const settings = Settings.getInstance();
    let buildDir = join(workspaceFolder.uri.fsPath, "build");
    if (
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      // Compiling with CMake Tools
      const cmakeBuildDir: string = await commands.executeCommand(
        "cmake.buildDirectory"
      );

      if (cmakeBuildDir) {
        buildDir = cmakeBuildDir;
      }
    }

    const platform = cmakeGetPicoVar(
      join(buildDir, "CMakeCache.txt"),
      "PICO_PLATFORM"
    );
    if (platform === null) {
      return "rp2040";
    }

    if (platform === "rp2350-arm-s" || platform === "rp2350-riscv") {
      return "rp2350";
    } else {
      return "rp2040";
    }
  }
}

export class GetChipUppercaseCommand extends CommandWithResult<string> {
  constructor() {
    super("getChipUppercase");
  }

  async execute(): Promise<string> {
    const cmd = new GetChipCommand();
    const chip = await cmd.execute();

    return chip.toUpperCase();
  }
}

export class GetTargetCommand extends CommandWithResult<string> {
  constructor() {
    super("getTarget");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];
    const isRustProject = State.getInstance().isRustProject;

    if (isRustProject) {
      const chip = rustProjectGetSelectedChip(workspaceFolder.uri.fsPath);

      return chip === null ? "rp2040" : chip.toLowerCase();
    }

    const settings = Settings.getInstance();
    let buildDir = join(workspaceFolder.uri.fsPath, "build");
    if (
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      // Compiling with CMake Tools
      const cmakeBuildDir: string = await commands.executeCommand(
        "cmake.buildDirectory"
      );

      if (cmakeBuildDir) {
        buildDir = cmakeBuildDir;
      }
    }

    const platform = cmakeGetPicoVar(
      join(buildDir, "CMakeCache.txt"),
      "PICO_PLATFORM"
    );
    if (platform === null) {
      return "rp2040";
    }

    if (platform === "rp2350-arm-s") {
      return "rp2350";
    } else if (platform === "rp2350-riscv") {
      return "rp2350-riscv";
    } else {
      return "rp2040";
    }
  }
}

export class GetPicotoolPathCommand extends CommandWithResult<
  string | undefined
> {
  private running: boolean = false;

  public static readonly id = "getPicotoolPath";

  constructor() {
    super(GetPicotoolPathCommand.id);
  }

  async execute(): Promise<string | undefined> {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    // get latest release
    const picotoolReleases = await getPicotoolReleases();

    if (picotoolReleases === null) {
      this.running = false;

      return undefined;
    }

    // it is sorted latest to oldest
    const picotoolVersion = picotoolReleases[0];

    // check if it is installed if not install it
    const result = await downloadAndInstallPicotool(picotoolVersion);

    if (result === null || !result) {
      this.running = false;

      return undefined;
    }

    this.running = false;

    // TODO: maybe move "picotool" into buildPath or install it so the files
    // are in root of buildPath
    return join(
      buildPicotoolPath(picotoolVersion),
      "picotool",
      process.platform === "win32" ? "picotool.exe" : "picotool"
    );
  }
}

export class GetOpenOCDRootCommand extends CommandWithResult<
  string | undefined
> {
  private running: boolean = false;

  public static readonly id = "getOpenOCDRoot";

  constructor() {
    super(GetOpenOCDRootCommand.id);
  }

  async execute(): Promise<string | undefined> {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    // check if it is installed if not install it
    const result = await downloadAndInstallOpenOCD(OPENOCD_VERSION);

    if (result === null || !result) {
      this.running = false;

      return undefined;
    }

    this.running = false;

    return buildOpenOCDPath(OPENOCD_VERSION);
  }
}

/**
 * Currently rust only!
 */
export class GetSVDPathCommand extends CommandWithResult<string | undefined> {
  public static readonly id = "getSVDPath";

  constructor(private readonly _extensionUri: Uri) {
    super(GetSVDPathCommand.id);
  }

  async execute(): Promise<string | undefined> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const isRustProject = State.getInstance().isRustProject;
    if (!isRustProject) {
      return;
    }

    const vs = new VersionBundlesLoader(this._extensionUri);
    const latestSDK = await vs.getLatestSDK();
    if (!latestSDK) {
      return;
    }

    const chip = rustProjectGetSelectedChip(
      workspace.workspaceFolders[0].uri.fsPath
    );

    if (!chip) {
      return;
    }

    const theChip = chip === "rp2350-riscv" ? "rp2350" : chip;

    return joinPosix(
      buildSDKPath(latestSDK),
      "src",
      theChip,
      "hardware_regs",
      `${theChip.toUpperCase()}.svd`
    );
  }
}

export class GetWestPathCommand extends CommandWithResult<string | undefined> {
  private running: boolean = false;

  public static readonly id = "getWestPath";

  constructor() {
    super(GetWestPathCommand.id);
  }

  execute(): string | undefined {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    const result = buildWestPath();

    if (result === null || !result) {
      this.running = false;

      return undefined;
    }

    this.running = false;

    return result;
  }
}

export class GetZephyrWorkspacePathCommand extends CommandWithResult<
  string | undefined
> {
  private running: boolean = false;

  public static readonly id = "getZephyrWorkspacePath";

  constructor() {
    super(GetZephyrWorkspacePathCommand.id);
  }

  execute(): string | undefined {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    const result = buildZephyrWorkspacePath();

    if (result === null || !result) {
      this.running = false;

      return undefined;
    }

    this.running = false;

    return result;
  }
}

export class SetupZephyrCommand extends CommandWithResult<string | undefined> {
  private running: boolean = false;

  public static readonly id = "setupZephyr";

  constructor() {
    super(SetupZephyrCommand.id);
  }

  private readonly _logger: Logger = new Logger("SetupZephyr");

  private _runCommand(
    command: string,
    options: ExecOptions
  ): Promise<number | null> {
    this._logger.debug(`Running: ${command}`);

    return new Promise<number | null>(resolve => {
      const generatorProcess = exec(
        command,
        options,
        (error, stdout, stderr) => {
          this._logger.debug(stdout);
          this._logger.info(stderr);
          if (error) {
            this._logger.error(`Setup venv error: ${error.message}`);
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

  async execute(): Promise<string | undefined> {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    window.showInformationMessage("Setup Zephyr Command Running");

    const settings = Settings.getInstance();
    if (settings === undefined) {
      this._logger.error("Settings not initialized.");

      return;
    }

    // TODO: this does take about 2s - may be reduced
    const gitPath = await ensureGit(settings, { returnPath: true });
    if (typeof gitPath !== "string" || gitPath.length === 0) {
      return;
    }

    this._logger.info("Installing CMake");
    const cmakeResult = await downloadAndInstallCmake("v3.31.5");
    if (!cmakeResult) {
      window.showErrorMessage("Could not install CMake. Exiting Zephyr Setup");
    }
    window.showInformationMessage("CMake installed.");

    this._logger.info("Installing Ninja");
    const ninjaResult = await downloadAndInstallNinja("v1.12.1");
    if (!ninjaResult) {
      window.showErrorMessage("Could not install Ninja. Exiting Zephyr Setup");
    }
    window.showInformationMessage("Ninja installed.");

    const python3Path = await findPython();
    if (!python3Path) {
      this._logger.error("Failed to find Python3 executable.");
      showPythonNotFoundError();

      return;
    }

    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Setup other Zephyr dependencies
      this._logger.info("Installing dtc");
      const dtcResult = await downloadAndInstallArchive(
        "https://github.com/oss-winget/oss-winget-storage/raw/" +
          "96ea1b934342f45628a488d3b50d0c37cf06012c/packages/dtc/" +
          "1.6.1/dtc-msys2-1.6.1-x86_64.zip",
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "dtc"),
        "dtc-msys2-1.6.1-x86_64.zip",
        "dtc"
      );
      if (!dtcResult) {
        window.showErrorMessage("Could not install DTC. Exiting Zephyr Setup");

        return;
      }
      window.showInformationMessage("DTC installed.");

      this._logger.info("Installing gperf");
      const gperfResult = await downloadAndInstallArchive(
        "https://sourceforge.net/projects/gnuwin32/files/gperf/3.0.1/" +
          "gperf-3.0.1-bin.zip/download",
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "gperf"),
        "gperf-3.0.1-bin.zip",
        "gperf"
      );
      if (!gperfResult) {
        window.showErrorMessage(
          "Could not install gperf. Exiting Zephyr Setup"
        );

        return;
      }
      window.showInformationMessage("gperf installed.");

      this._logger.info("Installing wget");
      const wgetResult = await downloadAndInstallArchive(
        "https:///eternallybored.org/misc/wget/releases/wget-1.21.4-win64.zip",
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget"),
        "wget-1.21.4-win64.zip",
        "wget"
      );
      if (!wgetResult) {
        window.showErrorMessage("Could not install wget. Exiting Zephyr Setup");

        return;
      }
      window.showInformationMessage("wget installed.");

      this._logger.info("Installing 7zip");
      const szipURL = new URL("https://7-zip.org/a/7z2409-x64.exe");
      const szipResult = await downloadFileGot(
        szipURL,
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "7zip-x64.exe")
      );

      if (!szipResult) {
        window.showErrorMessage(
          "Could not download 7zip. Exiting Zephyr Setup"
        );

        return;
      }

      const szipCommand: string = "7zip-x64.exe";
      const szipInstallResult = await this._runCommand(szipCommand, {
        cwd: joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk"),
      });

      if (szipInstallResult !== 0) {
        window.showErrorMessage(
          "Could not install 7zip. Please ensure 7-Zip is installed." +
            "Exiting Zephyr Setup"
        );

        return;
      }

      // Clean up
      rmSync(
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "7zip-x64.exe")
      );

      window.showInformationMessage("7zip installed.");
    }

    this._logger.info("Installing OpenOCD");
    const openocdResult = await downloadAndInstallOpenOCD(openOCDVersion);
    if (!openocdResult) {
      window.showErrorMessage(
        "Could not install OpenOCD. Exiting Zephyr Setup"
      );

      return;
    }

    const pythonExe = python3Path.replace(
      HOME_VAR,
      homedir().replaceAll("\\", "/")
    );

    const customEnv = process.env;
    // const customPath = await getPath();
    // this._logger.info(`Path: ${customPath}`);
    // if (!customPath) {
    //   return;
    // }

    const customPath =
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "cmake",
        "v3.31.5",
        "bin"
      )};` +
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "dtc",
        "bin"
      )};` +
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "git",
        "cmd"
      )};` +
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "gperf",
        "bin"
      )};` +
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "ninja",
        "v1.12.1"
      )};` +
      `${joinPosix(
        homedir().replaceAll("\\", "/"),
        ".pico-sdk",
        "python",
        "3.12.6"
      )};` +
      `${joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget")};` +
      `${joinPosix("C:\\Program Files".replaceAll("\\", "/"), "7-Zip")};` +
      gitPath +
      ";";

    this._logger.info(`New path: ${customPath}`);

    customPath.replaceAll("/", "\\");
    customEnv[isWindows ? "Path" : "PATH"] =
      customPath + customEnv[isWindows ? "Path" : "PATH"];

    const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();

    const zephyrManifestDir: string = joinPosix(
      zephyrWorkspaceDirectory,
      "manifest"
    );

    const zephyrManifestFile: string = joinPosix(zephyrManifestDir, "west.yml");

    const zephyrManifestContent: string = `
manifest:
  self:
    west-commands: scripts/west-commands.yml

  remotes:
    - name: zephyrproject-rtos
      url-base: https://github.com/magpieembedded

  projects:
    - name: zephyr
      remote: zephyrproject-rtos
      revision: pico2w
      import:
        # By using name-allowlist we can clone only the modules that are
        # strictly needed by the application.
        name-allowlist:
          - cmsis_6      # required by the ARM Cortex-M port
          - hal_rpi_pico # required for Pico board support
          - hal_infineon # required for Wifi chip support
`;

    await workspace.fs.writeFile(
      Uri.file(zephyrManifestFile),
      Buffer.from(zephyrManifestContent)
    );

    const command: string = [
      `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
      "-m virtualenv venv",
    ].join(" ");

    // Create a Zephyr workspace, copy the west manifest in and initialise the workspace
    workspace.fs.createDirectory(Uri.file(zephyrWorkspaceDirectory));

    this._logger.info("Setting up virtual environment for Zephyr");
    let result = await this._runCommand(command, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    this._logger.info(`${result}`);

    const venvPythonExe: string = joinPosix(
      process.env.ComSpec === "powershell.exe" ? "&" : "",
      zephyrWorkspaceDirectory,
      "venv",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "python.exe" : "python"
    );

    const command2: string = [
      venvPythonExe,
      "-m pip install west pyelftools",
    ].join(" ");

    this._logger.info("Installing Python dependencies for Zephyr");
    result = await this._runCommand(command2, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    const westExe: string = joinPosix(
      process.env.ComSpec === "powershell.exe" ? "&" : "",
      zephyrWorkspaceDirectory,
      "venv",
      process.platform === "win32" ? "Scripts" : "bin",
      process.platform === "win32" ? "west.exe" : "west"
    );

    const zephyrWorkspaceFiles = await workspace.fs.readDirectory(
      Uri.file(zephyrWorkspaceDirectory)
    );

    const westAlreadyExists = zephyrWorkspaceFiles.find(x => x[0] === ".west");
    if (westAlreadyExists) {
      this._logger.info("West workspace already initialised.");
    } else {
      this._logger.info("No West workspace found. Initialising...");

      const westInitCommand: string = [westExe, "init -l manifest"].join(" ");
      result = await this._runCommand(westInitCommand, {
        cwd: zephyrWorkspaceDirectory,
        windowsHide: true,
        env: customEnv,
      });

      this._logger.info(`${result}`);
    }

    const westUpdateCommand: string = [westExe, "update"].join(" ");

    this._logger.info("Updating West workspace");
    result = await this._runCommand(westUpdateCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    this._logger.info(`${result}`);

    const zephyrExportCommand: string = [westExe, "zephyr-export"].join(" ");
    this._logger.info("Exporting Zephyr CMake Files");
    result = await this._runCommand(zephyrExportCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    const westPipPackagesCommand: string = [
      westExe,
      "packages pip --install",
    ].join(" ");

    this._logger.info("Installing West Python packages");
    result = await this._runCommand(westPipPackagesCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    this._logger.info(`${result}`);

    const westBlobsFetchCommand: string = [
      westExe,
      "blobs fetch hal_infineon",
    ].join(" ");

    this._logger.info("Fetching binary blobs for Zephyr");
    result = await this._runCommand(westBlobsFetchCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    this._logger.info(`${result}`);

    const westInstallSDKCommand: string = [
      westExe,
      "sdk install -t arm-zephyr-eabi",
      `-b ${zephyrWorkspaceDirectory}`,
    ].join(" ");

    this._logger.info("Installing Zephyr SDK");
    result = await this._runCommand(westInstallSDKCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    this._logger.info(`${result}`);

    this._logger.info("Complete");

    this.running = false;

    return "";
  }
}
