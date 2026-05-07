import { existsSync } from "fs";
import { homedir } from "os";
import { commands, ProgressLocation, window, type Uri } from "vscode";
import type { Progress as GotProgress } from "got";
import Logger, { LoggerSource } from "../logger.mjs";
import { ContextKeys } from "../contextKeys.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import { downloadAndInstallSDK } from "../utils/download.mjs";
import { SDK_REPOSITORY_URL } from "../utils/sharedConstants.mjs";
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
  if (path === undefined || !path.includes(`/.pico-sdk/${tool}`)) {
    return undefined;
  }

  const regex =
    tool === "cmake"
      ? /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//
      : /\/\.pico-sdk\/ninja\/([v.0-9]+)\//;

  return regex.exec(path)?.[1];
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

export async function ensurePicoSdkInstalled(input: {
  extensionUri: Uri;
  sdkVersion: string;
  python3Path?: string;
  title: string;
  failureMessage: string;
  logFailurePrefix: string;
  logSuccessPrefix: string;
}): Promise<boolean> {
  const result = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: input.title,
      cancellable: false,
    },
    async progress => {
      const installResult = await downloadAndInstallSDK(
        input.extensionUri,
        input.sdkVersion,
        SDK_REPOSITORY_URL,
        input.python3Path
      );

      progress.report({ increment: 100 });

      return installResult;
    }
  );

  if (!result) {
    Logger.error(
      LoggerSource.extension,
      input.logFailurePrefix,
      `version: ${input.sdkVersion}.`,
      "Make sure all requirements are met."
    );
    void window.showErrorMessage(input.failureMessage);

    return false;
  }

  Logger.info(
    LoggerSource.extension,
    input.logSuccessPrefix,
    `version: ${input.sdkVersion}`
  );

  return true;
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
  if (configuredPath === undefined || version === undefined) {
    return true;
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

export async function withDownloadProgress(
  title: string,
  action: (progress?: (progress: GotProgress) => void) => Promise<boolean>
): Promise<boolean> {
  let progressState = 0;

  return window.withProgress(
    {
      location: ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    async progress => {
      const result = await action((prog: GotProgress) => {
        const percent = prog.percent * 100;
        progress.report({ increment: percent - progressState });
        progressState = percent;
      });
      progress.report({ increment: 100 });

      return result;
    }
  );
}
