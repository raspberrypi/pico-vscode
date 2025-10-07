import { Uri, window, workspace } from "vscode";
import {
  ALL_DEPS,
  type DependencyMeta,
  INSTALL_ROOT_ALIAS,
  type DepId,
} from "../models/dependency.mjs";
import { homedir } from "os";
import LastUsedDepsStore from "./lastUsedDeps.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import Logger, { LoggerSource } from "../logger.mjs";

const SDK_ROOT = Uri.joinPath(Uri.file(homedir()), ".pico-sdk");

function metaFor(dep: DepId): DependencyMeta | undefined {
  return ALL_DEPS.find(d => d.id === dep);
}
function isVersioned(dep: DepId): boolean {
  return metaFor(dep)?.versioned !== false; // default true
}

function resolveInstallUri(dep: DepId, version?: string): Uri {
  if (dep === "zephyr") {
    if (!version) {
      throw new Error("Version required for zephyr");
    }
    // Accept either "zephyr-v4.2.0" or "v4.2.0"/"main"
    const folder = version.startsWith("zephyr-")
      ? version
      : `zephyr-${version}`;

    return Uri.joinPath(SDK_ROOT, "zephyr_workspace", folder);
  }

  const root = INSTALL_ROOT_ALIAS[dep] ?? dep;

  if (isVersioned(dep)) {
    if (!version) {
      throw new Error(`Version required for ${dep}`);
    }

    return Uri.joinPath(SDK_ROOT, root, version);
  }

  // non-versioned (e.g., 7zip)
  return Uri.joinPath(SDK_ROOT, root);
}

export async function uninstallOne(
  depIdStr: string,
  version?: string
): Promise<void> {
  const depId = depIdStr as DepId;
  if (!metaFor(depId)) {
    throw new Error(`Unknown dependency: ${depId}`);
  }
  const target = resolveInstallUri(depId, version);

  // ensure it exists
  try {
    await workspace.fs.stat(target);
  } catch {
    Logger.warn(
      LoggerSource.uninstallUtil,
      `Cannot uninstall ${depId} ${version ?? ""}: not found at ${
        target.fsPath
      }`
    );

    return;
  }

  // delete folder (prefer hard delete; fall back to trash if needed)
  try {
    await workspace.fs.delete(target, {
      recursive: true,
      useTrash: false,
    });
  } catch {
    // VS Code supports useTrash in recent versions; try it as a fallback
    try {
      // useTrash is supported in VS Code >=1.92
      await workspace.fs.delete(target, {
        recursive: true,
        useTrash: true,
      });
    } catch (e2) {
      Logger.error(
        LoggerSource.uninstallUtil,
        `Failed to uninstall ${depId} ${version ?? ""}: ${unknownErrorToString(
          e2
        )}`
      );
      void window.showWarningMessage(
        `Failed to uninstall ${depId} ${version ?? ""}: ${unknownErrorToString(
          e2
        )}`
      );

      return;
    }
  }

  // update bookkeeping
  const store = LastUsedDepsStore.instance;
  await store.recordUninstalled(depId, version);
  await store.clear(depId, version);
}
