import { existsSync } from "fs";
import { homedir } from "os";
import { commands, ProgressLocation, window } from "vscode";
import type { Progress as GotProgress } from "got";
import Logger, { LoggerSource } from "../logger.mjs";
import { ContextKeys } from "../contextKeys.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import type Settings from "../settings.mjs";
import type { ProjectContextFlags } from "./types.mjs";

export async function setProjectContext(
  flags: ProjectContextFlags
): Promise<void> {
  await commands.executeCommand(
    "setContext",
    ContextKeys.isPicoProject,
    flags.isPicoProject
  );
  await commands.executeCommand(
    "setContext",
    ContextKeys.isRustProject,
    flags.isRustProject
  );
  await commands.executeCommand(
    "setContext",
    ContextKeys.isZephyrProject,
    flags.isZephyrProject
  );
}

export function selectedManagedToolVersion(
  path: string | undefined,
  tool: "cmake" | "ninja"
): string | undefined {
  if (path === undefined || !isManagedToolPath(path, tool)) {
    return undefined;
  }

  const regex =
    tool === "cmake"
      ? /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//
      : /\/\.pico-sdk\/ninja\/([v.0-9]+)\//;

  return regex.exec(path)?.[1];
}

export function isManagedToolPath(
  path: string | undefined,
  tool: "cmake" | "ninja"
): boolean {
  return path?.includes(`/.pico-sdk/${tool}`) ?? false;
}

export function resolveHomePath(path: string): string {
  return path.replace(HOME_VAR, homedir().replaceAll("\\", "/"));
}

export function ensureExe(inp: string): string {
  return process.platform === "win32"
    ? inp.endsWith(".exe")
      ? inp
      : `${inp}.exe`
    : inp;
}

export async function ensureManagedTool(
  settings: Settings,
  tool: "cmake" | "ninja",
  installer: (
    version: string,
    progress?: (progress: GotProgress) => void
  ) => Promise<boolean>
): Promise<boolean> {
  const settingKey =
    tool === "cmake" ? SettingsKey.cmakePath : SettingsKey.ninjaPath;
  const configuredPath = settings.getString(settingKey);
  const version = selectedManagedToolVersion(configuredPath, tool);
  if (
    configuredPath === undefined ||
    !isManagedToolPath(configuredPath, tool)
  ) {
    return true;
  }

  if (version === undefined) {
    Logger.error(
      LoggerSource.extension,
      `Failed to get ${tool === "cmake" ? "CMake" : "Ninja"} version ` +
        "from path in the settings."
    );

    return false;
  }

  if (existsSync(ensureExe(configuredPath.replace(HOME_VAR, homedir())))) {
    return true;
  }

  Logger.debug(
    LoggerSource.extension,
    `${tool} path in settings does not exist.`,
    `Installing ${tool} to default path.`
  );

  let progressState = 0;
  const result = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: `Downloading and installing ${
        tool === "cmake" ? "CMake" : "Ninja"
      }. This may take a while...`,
      cancellable: false,
    },
    async progress => {
      const installResult = await installer(version, (prog: GotProgress) => {
        const percent = prog.percent * 100;
        progress.report({ increment: percent - progressState });
        progressState = percent;
      });
      progress.report({ increment: 100 });

      return installResult;
    }
  );

  if (!result) {
    Logger.error(
      LoggerSource.extension,
      `Failed to install ${tool === "cmake" ? "CMake" : "ninja"}.`
    );
  }

  return result;
}
