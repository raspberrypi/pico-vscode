import { join } from "path";
import { commands, type Uri, type WorkspaceFolder } from "vscode";
import Settings, { SettingsKey } from "../settings.mjs";
import { cmakeGetPicoVar } from "../utils/cmakeUtil.mjs";
import VersionBundlesLoader from "../utils/versionBundles.mjs";
import { getSupportedToolchains } from "../utils/toolchainUtil.mjs";
import { createProjectVariantRegistry } from "./index.mjs";
import type {
  PicoProjectVariant,
  ProjectSelections,
} from "./types.mjs";

export async function getActiveProjectVariant(
  folder: WorkspaceFolder
): Promise<PicoProjectVariant | undefined> {
  return createProjectVariantRegistry().getActive(folder);
}

export async function getActiveProjectSelections(
  folder: WorkspaceFolder
): Promise<ProjectSelections | undefined> {
  const variant = await getActiveProjectVariant(folder);
  const selections = await variant?.readSelections(folder);

  return selections ?? undefined;
}

export async function getActiveProjectChip(
  folder: WorkspaceFolder
): Promise<"rp2040" | "rp2350" | "rp235x" | undefined> {
  const variant = await getActiveProjectVariant(folder);
  if (variant === undefined) {
    return undefined;
  }

  if (variant.id === "c-cpp") {
    const platform = await getCmakeProjectPlatform(folder);

    return platform === "rp2350-arm-s" || platform === "rp2350-riscv"
      ? "rp2350"
      : "rp2040";
  }

  const selections = await variant.readSelections(folder);
  if (selections === null) {
    return undefined;
  }

  if (variant.id === "rust") {
    return selections.chip === "rp2350" || selections.chip === "rp2350-riscv"
      ? "rp235x"
      : selections.chip;
  }

  return selections.chip === "rp2350-riscv" ? "rp2350" : selections.chip;
}

export async function getActiveProjectTarget(
  folder: WorkspaceFolder
): Promise<"rp2040" | "rp2350" | "rp2350-riscv" | undefined> {
  const variant = await getActiveProjectVariant(folder);
  if (variant === undefined) {
    return undefined;
  }

  if (variant.id === "c-cpp") {
    const platform = await getCmakeProjectPlatform(folder);
    if (platform === "rp2350-arm-s") {
      return "rp2350";
    } else if (platform === "rp2350-riscv") {
      return "rp2350-riscv";
    }

    return "rp2040";
  }

  const selections = await variant.readSelections(folder);
  if (selections === null) {
    return undefined;
  }

  return selections.target;
}

export async function getActiveProjectToolchainVersion(
  folder: WorkspaceFolder,
  extensionUri?: Uri
): Promise<string | undefined> {
  const variant = await getActiveProjectVariant(folder);
  if (variant === undefined) {
    return undefined;
  }

  if (variant.id === "rust") {
    if (extensionUri === undefined) {
      return undefined;
    }

    const vbl = new VersionBundlesLoader(extensionUri);
    const latestVb = await vbl.getLatest();
    if (latestVb === undefined) {
      return undefined;
    }

    const selections = await variant.readSelections(folder);
    const useRiscv = selections?.chip?.includes("riscv") ?? false;

    return useRiscv ? latestVb[1].riscvToolchain : latestVb[1].toolchain;
  }

  const selections = await variant.readSelections(folder);

  return selections?.toolchainVersion;
}

export async function getActiveProjectSdkVersion(
  folder: WorkspaceFolder,
  extensionUri: Uri
): Promise<string | undefined> {
  const variant = await getActiveProjectVariant(folder);
  if (variant === undefined) {
    return undefined;
  }

  if (variant.id === "rust") {
    return new VersionBundlesLoader(extensionUri).getLatestSDK();
  }

  const selections = await variant.readSelections(folder);

  return selections?.sdkVersion;
}

export async function getActiveProjectSupportedToolchain(
  folder: WorkspaceFolder,
  extensionUri: Uri
): Promise<string | undefined> {
  const toolchainVersion = await getActiveProjectToolchainVersion(
    folder,
    extensionUri
  );
  if (toolchainVersion === undefined) {
    return undefined;
  }

  const supportedToolchains = await getSupportedToolchains(extensionUri);
  const supportedToolchain = supportedToolchains.find(
    toolchain => toolchain.version === toolchainVersion
  );

  return supportedToolchain?.version;
}

export function toolchainTriple(toolchainVersion: string): string {
  if (toolchainVersion.includes("RISCV")) {
    return toolchainVersion.includes("COREV")
      ? "riscv32-corev-elf"
      : "riscv32-unknown-elf";
  }

  return "arm-none-eabi";
}

async function getCmakeProjectPlatform(
  folder: WorkspaceFolder
): Promise<string | null> {
  const settings = Settings.getInstance();
  let buildDir = join(folder.uri.fsPath, "build");
  if (
    settings !== undefined &&
    settings.getBoolean(SettingsKey.useCmakeTools)
  ) {
    const cmakeBuildDir: string = await commands.executeCommand(
      "cmake.buildDirectory"
    );

    if (cmakeBuildDir) {
      buildDir = cmakeBuildDir;
    }
  }

  return cmakeGetPicoVar(join(buildDir, "CMakeCache.txt"), "PICO_PLATFORM");
}
