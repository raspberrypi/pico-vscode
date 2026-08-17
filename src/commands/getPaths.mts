import { CommandWithResult } from "./command.mjs";
import { Uri, window, workspace, type WorkspaceFolder } from "vscode";
import { getPythonPath, getPath } from "../utils/cmakeUtil.mjs";
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
import type Settings from "../settings.mjs";
import which from "which";
import { execSync } from "child_process";
import { getPicotoolReleases } from "../utils/githubREST.mjs";
import Logger from "../logger.mjs";
import { OPENOCD_VERSION } from "../utils/sharedConstants.mjs";
import {
  GET_CHIP,
  GET_CHIP_UPPERCASE,
  GET_COMPILER_PATH,
  GET_CXX_COMPILER_PATH,
  GET_ENV_PATH,
  GET_GDB_PATH,
  GET_GIT_PATH,
  GET_OPENOCD_ROOT,
  GET_PICOTOOL_PATH,
  GET_PYTHON_PATH,
  GET_SVD_PATH,
  GET_TARGET,
  GET_WEST_PATH,
  GET_ZEPHYR_SDK_PATH,
  GET_ZEPHYR_WORKSPACE_PATH,
} from "./cmdIds.mjs";
import { getZephyrSDKVersion } from "../utils/setupZephyr.mjs";
import { ensureGit } from "../utils/gitUtil.mjs";
import {
  ZEPHYR_PICO,
  ZEPHYR_PICO2,
  ZEPHYR_PICO2_W,
  ZEPHYR_PICO_W,
} from "../models/zephyrBoards.mjs";
import {
  getActiveProjectChip,
  getActiveProjectSelections,
  getActiveProjectSdkVersion,
  getActiveProjectSupportedToolchain,
  getActiveProjectTarget,
  getActiveProjectToolchainVersion,
  getActiveProjectVariant,
  toolchainTriple,
} from "../projectVariants/selectionHelpers.mjs";

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

    const env = await getPath();
    const pathValue = process.platform === "win32" ? env.Path : env.PATH;

    return pathValue ?? "";
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
    const variant = await getActiveProjectVariant(workspaceFolder);
    const toolchainVersion =
      variant?.id === "rust"
        ? await getActiveProjectSupportedToolchain(
            workspaceFolder,
            this._extensionUri
          )
        : await getActiveProjectToolchainVersion(
            workspaceFolder,
            this._extensionUri
          );
    if (toolchainVersion === undefined) {
      if (variant?.id === "rust") {
        void window.showErrorMessage(
          "No supported toolchain found for the latest version."
        );
      } else if (variant?.id !== "zephyr") {
        void window.showErrorMessage(
          "No supported toolchain found for this project."
        );
      }

      return "";
    }

    const triple = toolchainTriple(toolchainVersion);
    if (triple === "arm-none-eabi" && process.platform === "linux") {
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

    return joinPosix(
      buildToolchainPath(toolchainVersion),
      "bin",
      triple + "-gdb"
    );
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
    const toolchainVersion = await getActiveProjectToolchainVersion(
      workspaceFolder
    );
    if (toolchainVersion === undefined) {
      return "";
    }
    const triple = toolchainTriple(toolchainVersion);

    return joinPosix(
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
    const toolchainVersion = await getActiveProjectToolchainVersion(
      workspaceFolder
    );
    if (toolchainVersion === undefined) {
      return "";
    }
    const triple = toolchainTriple(toolchainVersion);

    return joinPosix(
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
    const chip = await getActiveProjectChip(workspaceFolder);
    if (chip === undefined) {
      await this.showProjectChipError(workspaceFolder);

      return "rp2040";
    }

    return chip;
  }

  private async showProjectChipError(
    workspaceFolder: WorkspaceFolder
  ): Promise<void> {
    const variant = await getActiveProjectVariant(workspaceFolder);
    const selections = await getActiveProjectSelections(workspaceFolder);
    if (variant?.id === "zephyr" && selections?.boardId !== undefined) {
      this._logger.error(`Unsupported Zephyr board: ${selections.boardId}`);
      void window.showErrorMessage(
        `Unsupported Zephyr board: ${selections.boardId}. ` +
          `Supported boards are: ${ZEPHYR_PICO}, ${ZEPHYR_PICO_W}, ` +
          `${ZEPHYR_PICO2}, ${ZEPHYR_PICO2_W}`
      );

      return;
    }

    this._logger.error("Failed to read active project chip");
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

    return (await getActiveProjectTarget(workspaceFolder)) ?? "rp2040";
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
    return joinPosix(
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

    const workspaceFolder = workspace.workspaceFolders[0];
    const variant = await getActiveProjectVariant(workspaceFolder);
    if (variant?.id !== "rust") {
      return;
    }

    const latestSDK = await getActiveProjectSdkVersion(
      workspaceFolder,
      this._extensionUri
    );
    if (!latestSDK) {
      return;
    }

    const target = await getActiveProjectTarget(workspaceFolder);
    if (target === undefined) {
      return;
    }

    const theChip = target === "rp2350-riscv" ? "rp2350" : target;

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
    return buildZephyrWorkspacePath();
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

    try {
      await workspace.fs.stat(Uri.file(result));
      const zephyrSdkVersion = await getZephyrSDKVersion();

      return joinPosix(result, `zephyr-sdk-${zephyrSdkVersion ?? "unknown"}`);
    } catch {
      return undefined;
    }
  }
}

export class GetGitPathCommand extends CommandWithResult<string> {
  constructor(private readonly _settings: Settings) {
    super(GET_GIT_PATH);
  }

  async execute(): Promise<string> {
    const gitPath = await ensureGit(this._settings, { returnPath: true });
    if (
      typeof gitPath !== "string" ||
      gitPath.length === 0 ||
      !gitPath.includes("/")
    ) {
      return "";
    }

    return gitPath;
  }
}
