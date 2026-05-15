import { ProgressLocation, window, type Uri } from "vscode";
import type { Progress as GotProgress } from "got";
import Logger, { LoggerSource } from "../logger.mjs";
import {
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
} from "./download.mjs";
import {
  OPENOCD_VERSION,
  SDK_REPOSITORY_URL,
} from "./sharedConstants.mjs";
import { getSupportedToolchains } from "./toolchainUtil.mjs";

export interface PicoDependencySelections {
  sdkVersion?: string;
  toolchainVersion?: string;
  picotoolVersion?: string;
}

export async function ensureBasePicoDependencies(input: {
  extensionUri: Uri;
  selections: PicoDependencySelections;
  title: string;
  sdkFailureMessage: string;
  sdkLogFailurePrefix: string;
  sdkLogSuccessPrefix: string;
  python3Path?: string;
}): Promise<boolean> {
  if (
    input.selections.sdkVersion === undefined ||
    input.selections.toolchainVersion === undefined ||
    input.selections.picotoolVersion === undefined
  ) {
    return false;
  }

  const sdkInstalled = await ensurePicoSdkInstalled({
    extensionUri: input.extensionUri,
    sdkVersion: input.selections.sdkVersion,
    python3Path: input.python3Path,
    title: input.title,
    failureMessage: input.sdkFailureMessage,
    logFailurePrefix: input.sdkLogFailurePrefix,
    logSuccessPrefix: input.sdkLogSuccessPrefix,
  });
  if (!sdkInstalled) {
    return false;
  }

  const toolchains = await getSupportedToolchains(input.extensionUri);
  const selectedToolchain = toolchains.find(
    toolchain => toolchain.version === input.selections.toolchainVersion
  );
  if (selectedToolchain === undefined) {
    Logger.error(
      LoggerSource.extension,
      "Failed to detect project toolchain version."
    );
    void window.showErrorMessage("Failed to detect project toolchain version.");

    return false;
  }

  const toolchainInstalled = await withDownloadProgress(
    "Downloading and installing toolchain as selected. " +
      "This may take a while...",
    progress => downloadAndInstallToolchain(selectedToolchain, progress)
  );
  if (!toolchainInstalled) {
    Logger.error(
      LoggerSource.extension,
      "Failed to install project toolchain",
      `version: ${input.selections.toolchainVersion}`
    );
    void window.showErrorMessage(
      "Failed to install project toolchain version."
    );

    return false;
  }
  Logger.info(
    LoggerSource.extension,
    "Found/installed project toolchain",
    `version: ${input.selections.toolchainVersion}`
  );

  const toolsInstalled = await withDownloadProgress(
    "Downloading and installing tools as selected. This may take a while...",
    progress => downloadAndInstallTools(input.selections.sdkVersion!, progress)
  );
  if (!toolsInstalled) {
    Logger.error(
      LoggerSource.extension,
      "Failed to install project SDK",
      `version: ${input.selections.sdkVersion}.`,
      "Make sure all requirements are met."
    );
    void window.showErrorMessage("Failed to install project SDK version.");

    return false;
  }
  Logger.info(
    LoggerSource.extension,
    "Found/installed project SDK",
    `version: ${input.selections.sdkVersion}`
  );

  const picotoolInstalled = await withDownloadProgress(
    "Downloading and installing picotool as selected. " +
      "This may take a while...",
    progress =>
      downloadAndInstallPicotool(input.selections.picotoolVersion!, progress)
  );
  if (!picotoolInstalled) {
    Logger.error(LoggerSource.extension, "Failed to install picotool.");
    void window.showErrorMessage("Failed to install picotool.");

    return false;
  }
  Logger.debug(LoggerSource.extension, "Found/installed picotool.");

  const openOcdInstalled = await withDownloadProgress(
    "Downloading and installing OpenOCD. This may take a while...",
    progress => downloadAndInstallOpenOCD(OPENOCD_VERSION, progress)
  );
  if (!openOcdInstalled) {
    Logger.error(
      LoggerSource.extension,
      "Failed to download and install OpenOCD."
    );
    void window.showWarningMessage("Failed to download and install OpenOCD.");
  } else {
    Logger.debug(LoggerSource.extension, "Found/installed OpenOCD.");
    void window.showInformationMessage("OpenOCD found/installed successfully.");
  }

  return true;
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
