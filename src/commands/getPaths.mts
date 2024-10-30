import { CommandWithResult } from "./command.mjs";
import { commands, workspace } from "vscode";
import {
  getPythonPath,
  getPath,
  cmakeGetSelectedToolchainAndSDKVersions,
  cmakeGetPicoVar,
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import {
  buildPicotoolPath,
  buildToolchainPath,
  downloadAndInstallPicotool,
} from "../utils/download.mjs";
import Settings, { SettingsKey } from "../settings.mjs";
import which from "which";
import { execSync } from "child_process";
import { getPicotoolReleases } from "../utils/githubREST.mjs";

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
  constructor() {
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
      buildToolchainPath(toolchainVersion), "bin",
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
      buildToolchainPath(toolchainVersion), "bin",
      triple + `-g++${process.platform === "win32" ? ".exe" : ""}`
    );
  }
}

export class GetChipCommand extends CommandWithResult<string> {
  constructor() {
    super("getChip");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const workspaceFolder = workspace.workspaceFolders?.[0];

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
    super("getPicotoolPath");
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
