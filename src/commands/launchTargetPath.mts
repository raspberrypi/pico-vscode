import { readFileSync } from "fs";
import { CommandWithResult } from "./command.mjs";
import { commands, window, workspace } from "vscode";
import { join } from "path";
import Settings, { SettingsKey } from "../settings.mjs";
import State from "../state.mjs";
import { parse as parseToml } from "toml";
import { join as joinPosix } from "path/posix";
import { cmakeToolsForcePicoKit } from "../utils/cmakeToolsUtil.mjs";
import { rustProjectGetSelectedChip } from "../utils/rustUtil.mjs";

/* ----------------------------- Shared helpers ----------------------------- */

type SupportedChip = "rp2040" | "rp2350" | "rp2350-riscv" | null;

const wsRoot = (): string => workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

const norm = (p: string): string => p.replaceAll("\\", "/");

const isRustProject = (): boolean => State.getInstance().isRustProject;

const chipToTriple = (chip: SupportedChip): string => {
  switch (chip) {
    case "rp2040":
      return "thumbv6m-none-eabi";
    case "rp2350":
      return "thumbv8m.main-none-eabihf";
    case "rp2350-riscv":
    case null:
    default:
      // Default to RISC-V if unknown/null. Change if you prefer a different default.
      return "riscv32imac-unknown-none-elf";
  }
};

const readCargoPackageName = (root: string): string | undefined => {
  try {
    const contents = readFileSync(join(root, "Cargo.toml"), "utf-8");
    const cargo = parseToml(contents) as
      | { package?: { name?: string } }
      | undefined;

    return cargo?.package?.name;
  } catch {
    return undefined;
  }
};

const rustTargetPath = (
  root: string,
  mode: "debug" | "release",
  file?: string
): string => {
  const chip: SupportedChip = rustProjectGetSelectedChip(root);
  const triple = chipToTriple(chip);

  return joinPosix(norm(root), "target", triple, mode, file ?? "");
};

const readProjectNameFromCMakeLists = async (
  filename: string
): Promise<string | null> => {
  const fileContent = readFileSync(filename, "utf-8");

  const projectMatch = /project\(([^)\s]+)/.exec(fileContent);
  if (!projectMatch?.[1]) {
    return null;
  }

  const projectName = projectMatch[1].trim();

  const hasBg = /pico_cyw43_arch_lwip_threadsafe_background/.test(fileContent);
  const hasPoll = /pico_cyw43_arch_lwip_poll/.test(fileContent);

  if (hasBg && hasPoll) {
    const choice = await window.showQuickPick(
      ["Threadsafe Background", "Poll"],
      { placeHolder: "Select PicoW Architecture" }
    );
    if (choice === "Threadsafe Background") {
      return `${projectName}_background`;
    }
    if (choice === "Poll") {
      return `${projectName}_poll`;
    }
    // user dismissed → fall back to base name
  }

  return projectName;
};

const tryCMakeToolsLaunchPath = async (): Promise<string | null> => {
  const settings = Settings.getInstance();
  if (settings?.getBoolean(SettingsKey.useCmakeTools)) {
    await cmakeToolsForcePicoKit();
    const path: string = await commands.executeCommand(
      "cmake.launchTargetPath"
    );
    if (path) {
      return norm(path);
    }
  }

  return null;
};

/* ------------------------------ Main command ------------------------------ */

export default class LaunchTargetPathCommand extends CommandWithResult<string> {
  public static readonly id = "launchTargetPath";
  constructor() {
    super(LaunchTargetPathCommand.id);
  }

  async execute(): Promise<string> {
    const root = wsRoot();
    if (!root) {
      return "";
    }

    if (isRustProject()) {
      const name = readCargoPackageName(root);
      if (!name) {
        return "";
      }

      return rustTargetPath(root, "debug", name);
    }

    // Non-Rust: try CMake Tools first
    const cmakeToolsPath = await tryCMakeToolsLaunchPath();
    if (cmakeToolsPath) {
      return cmakeToolsPath;
    }

    // Fallback: parse CMakeLists + compile task, then return build/<name>.elf
    const cmakelists = join(root, "CMakeLists.txt");
    const projectName = await readProjectNameFromCMakeLists(cmakelists);
    if (!projectName) {
      return "";
    }

    const compiled = await commands.executeCommand(
      "raspberry-pi-pico.compileProject"
    );
    if (!compiled) {
      throw new Error(
        "Failed to compile project - check output from the Compile Project task"
      );
    }

    return norm(join(root, "build", `${projectName}.elf`));
  }
}

/* -------------------------- Rust-specific commands ------------------------- */

export class LaunchTargetPathReleaseCommand extends CommandWithResult<string> {
  public static readonly id = "launchTargetPathRelease";
  constructor() {
    super(LaunchTargetPathReleaseCommand.id);
  }

  execute(): string {
    const root = wsRoot();
    if (!root || !isRustProject()) {
      return "";
    }

    const name = readCargoPackageName(root);
    if (!name) {
      return "";
    }

    return rustTargetPath(root, "release", name);
  }
}

export class SbomTargetPathDebugCommand extends CommandWithResult<string> {
  public static readonly id = "sbomTargetPathDebug";
  constructor() {
    super(SbomTargetPathDebugCommand.id);
  }

  execute(): string {
    const root = wsRoot();
    if (!root || !isRustProject()) {
      return "";
    }

    // sbom is a fixed filename living next to build artifacts
    return rustTargetPath(root, "debug", "sbom.spdx.json");
  }
}

export class SbomTargetPathReleaseCommand extends CommandWithResult<string> {
  public static readonly id = "sbomTargetPathRelease";
  constructor() {
    super(SbomTargetPathReleaseCommand.id);
  }

  execute(): string {
    const root = wsRoot();
    if (!root || !isRustProject()) {
      return "";
    }

    return rustTargetPath(root, "release", "sbom.spdx.json");
  }
}
