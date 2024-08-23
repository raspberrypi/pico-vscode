import { CommandWithResult } from "./command.mjs";
import { commands, workspace } from "vscode";
import {
  getPythonPath,
  getPath,
  cmakeGetSelectedToolchainAndSDKVersions,
  cmakeGetPicoVar,
} from "../utils/cmakeUtil.mjs";
import { join } from "path";
import { buildToolchainPath } from "../utils/download.mjs";
import Settings, { SettingsKey } from "../settings.mjs";

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
    await cmakeGetSelectedToolchainAndSDKVersions(
      workspaceFolder.uri
    );
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
      if (process.arch === "arm64") {
        return "gdb";
      } else {
        return "gdb-multiarch";
      }
    }

    return join(buildToolchainPath(toolchainVersion), "bin", triple + "-gdb");
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
