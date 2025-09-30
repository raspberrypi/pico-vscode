import { CommandWithResult } from "./command.mjs";
import { commands, FileType, Uri, window, workspace } from "vscode";
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
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
} from "../utils/download.mjs";
import Settings, { SettingsKey } from "../settings.mjs";
import which from "which";
import { execSync } from "child_process";
import { getPicotoolReleases } from "../utils/githubREST.mjs";
import State from "../state.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import Logger from "../logger.mjs";
import { rustProjectGetSelectedChip } from "../utils/rustUtil.mjs";
import { OPENOCD_VERSION } from "../utils/sharedConstants.mjs";
import {
  GET_CHIP,
  GET_CHIP_UPPERCASE,
  GET_COMPILER_PATH,
  GET_CXX_COMPILER_PATH,
  GET_ENV_PATH,
  GET_GDB_PATH,
  GET_OPENOCD_ROOT,
  GET_PICOTOOL_PATH,
  GET_PYTHON_PATH,
  GET_SVD_PATH,
  GET_TARGET,
  GET_WEST_PATH,
  GET_ZEPHYR_SDK_PATH,
  GET_ZEPHYR_WORKSPACE_PATH,
} from "./cmdIds.mjs";
import { getBoardFromZephyrProject } from "../utils/setupZephyr.mjs";
import {
  ZEPHYR_PICO,
  ZEPHYR_PICO2,
  ZEPHYR_PICO2_W,
  ZEPHYR_PICO_W,
} from "../models/zephyrBoards.mjs";
import { compare } from "../utils/semverUtil.mjs";

export class GetPythonPathCommand extends CommandWithResult<string> {
  constructor() {
    super(GET_PYTHON_PATH);
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
    super(GET_ENV_PATH);
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
    super(GET_GDB_PATH);
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

      const supportedToolchains = await getSupportedToolchains(
        this._extensionUri
      );
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
    super(GET_COMPILER_PATH);
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
    super(GET_CXX_COMPILER_PATH);
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

  constructor() {
    super(GET_CHIP);
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
    const isZephyrProject = State.getInstance().isZephyrProject;

    if (isZephyrProject) {
      const board = await getBoardFromZephyrProject(
        join(workspaceFolder.uri.fsPath, ".vscode", "tasks.json")
      );

      if (board === undefined) {
        this._logger.error("Failed to read Zephyr board from tasks.json");

        return "";
      }

      switch (board) {
        case ZEPHYR_PICO:
        case ZEPHYR_PICO_W:
          return "rp2040";
        case ZEPHYR_PICO2:
        case ZEPHYR_PICO2_W:
          return "rp2350";
        default:
          this._logger.error(`Unsupported Zephyr board: ${board}`);
          void window.showErrorMessage(
            `Unsupported Zephyr board: ${board}. ` +
              `Supported boards are: ${ZEPHYR_PICO}, ${ZEPHYR_PICO_W}, ` +
              `${ZEPHYR_PICO2}, ${ZEPHYR_PICO2_W}`
          );

          return "rp2040";
      }
    }

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
    super(GET_CHIP_UPPERCASE);
  }

  async execute(): Promise<string> {
    const cmd = new GetChipCommand();
    const chip = await cmd.execute();

    return chip.toUpperCase();
  }
}

export class GetTargetCommand extends CommandWithResult<string> {
  constructor() {
    super(GET_TARGET);
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
    const isZephyrProject = State.getInstance().isZephyrProject;

    if (isZephyrProject) {
      const board = await getBoardFromZephyrProject(
        join(workspaceFolder.uri.fsPath, ".vscode", "tasks.json")
      );

      if (board === undefined) {
        return "rp2040";
      }

      switch (board) {
        case ZEPHYR_PICO:
        case ZEPHYR_PICO_W:
          return "rp2040";
        case ZEPHYR_PICO2:
        case ZEPHYR_PICO2_W:
          return "rp2350";
        default:
          return "rp2040";
      }
    }
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

  constructor() {
    super(GET_PICOTOOL_PATH);
  }

  // TODO: add rate limiting and caching
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

  constructor() {
    super(GET_OPENOCD_ROOT);
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
  constructor(private readonly _extensionUri: Uri) {
    super(GET_SVD_PATH);
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
  constructor() {
    super(GET_WEST_PATH);
  }

  execute(): string | undefined {
    const result = buildWestPath();

    if (result === null || !result) {
      return undefined;
    }

    return result;
  }
}

export class GetZephyrWorkspacePathCommand extends CommandWithResult<
  string | undefined
> {
  constructor() {
    super(GET_ZEPHYR_WORKSPACE_PATH);
  }

  execute(): string | undefined {
    const result = buildZephyrWorkspacePath();

    if (result === null || !result) {
      return undefined;
    }

    return result;
  }
}

export class GetZephyrSDKPathCommand extends CommandWithResult<
  string | undefined
> {
  constructor() {
    super(GET_ZEPHYR_SDK_PATH);
  }

  async execute(): Promise<string | undefined> {
    const result = buildZephyrWorkspacePath();

    if (result === null || !result) {
      return undefined;
    }
    const workspaceUri = Uri.file(result);

    try {
      await workspace.fs.stat(workspaceUri);
      const contents = await workspace.fs.readDirectory(workspaceUri);
      // TODO: get zephr version form west manifest and sdk_version from zephyr directory
      const sdksDirectories = contents
        .filter(
          entry =>
            entry[1] === FileType.Directory &&
            entry[0].startsWith("zephyr-sdk-")
        )
        .map(([name]) => name.replace(/^zephyr-sdk-/, ""))
        .sort((a, b) => compare(b, a)); // sort descending

      return joinPosix(result, `zephyr-sdk-${sdksDirectories[0]}`);
    } catch {
      return undefined;
    }
  }
}
