import { promisify } from "util";
import { exec } from "child_process";
import Logger, { LoggerSource } from "../logger.mjs";
import { unlink } from "fs/promises";
import type Settings from "../settings.mjs";
import { SettingsKey, HOME_VAR } from "../settings.mjs";
import { homedir } from "os";
import which from "which";
import { window } from "vscode";
import { compareGe } from "./semverUtil.mjs";
import { downloadGit } from "./downloadGit.mjs";

export const execAsync = promisify(exec);

export const MIN_GIT_VERSION = "2.28.0";
export const DEFAULT_GIT_EXE = "git";

export async function checkGitVersion(
  gitExecutable: string
): Promise<[boolean, string]> {
  const versionCommand = `${
    process.env.ComSpec === "powershell.exe" ? "&" : ""
  }"${gitExecutable}" version`;
  console.debug(`Checking git version: ${versionCommand}`);
  const ret = await execAsync(versionCommand);
  console.debug(
    `Git version check result: ${ret.stderr} stdout: ${ret.stdout}`
  );
  const regex = /git version (\d+\.\d+(\.\d+)*)/;
  const match = regex.exec(ret.stdout);
  if (match && match[1]) {
    const gitVersion = match[1];
    console.debug(`Found git version: ${gitVersion}`);

    return [compareGe(gitVersion, MIN_GIT_VERSION), gitVersion];
  } else {
    console.debug(
      `Error: Could not parse git version from output: ${ret.stdout}`
    );

    return [false, "unknown"];
  }
}

/**
 * Checks if a git executable is available or try to install if possible.
 *
 * @returns True if git is available, false otherwise or if
 * options.returnPath is true the path to the git executable.
 */
export async function ensureGit(
  settings: Settings,
  options?: { returnPath?: boolean }
): Promise<string | boolean | undefined> {
  const returnPath = options?.returnPath ?? false;

  const resolveGitPath = (): string =>
    settings
      .getString(SettingsKey.gitPath)
      ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) || DEFAULT_GIT_EXE;

  let gitExe = resolveGitPath();
  let gitPath = await which(gitExe, { nothrow: true });

  // If custom path is invalid, offer to reset to default
  if (gitExe !== DEFAULT_GIT_EXE && gitPath === null) {
    const selection = await window.showErrorMessage(
      "The path to the git executable is invalid. " +
        "Do you want to reset it and search in system PATH?",
      { modal: true, detail: gitExe },
      "Yes",
      "No"
    );

    if (selection === "Yes") {
      await settings.updateGlobal(SettingsKey.gitPath, undefined);
      settings.reload();
      gitExe = DEFAULT_GIT_EXE;
      gitPath = await which(DEFAULT_GIT_EXE, { nothrow: true });
    } else {
      return returnPath ? undefined : false;
    }
  }

  let isGitInstalled = gitPath !== null;
  let gitVersion: string | undefined;

  if (gitPath !== null) {
    const [isValid, version] = await checkGitVersion(gitPath);
    isGitInstalled = isValid;
    gitVersion = version;

    if (!isValid) {
      gitPath = null;
    }
  }

  // Try download if invalid or not found
  if (!isGitInstalled) {
    // Win32 x64 only
    const downloadedGitPath = await downloadGit();

    if (downloadedGitPath) {
      await settings.updateGlobal(SettingsKey.gitPath, downloadedGitPath);
      isGitInstalled = true;
      gitPath = downloadedGitPath.replace(
        HOME_VAR,
        homedir().replaceAll("\\", "/")
      );
    } else if (gitVersion) {
      Logger.error(
        LoggerSource.gitUtil,
        `Installed Git is too old (${gitVersion})` +
          "and a new version could not be downloaded."
      );
      void window.showErrorMessage(
        `Found Git version ${gitVersion}, but requires ${MIN_GIT_VERSION}. ` +
          "Please install and add to PATH or " +
          "set the path to the git executable in global settings."
      );
    } else {
      Logger.error(
        LoggerSource.gitUtil,
        "Git is not installed and could not be downloaded."
      );
      void window.showErrorMessage(
        "Git is not installed. Please install and add to PATH or " +
          "set the path to the git executable in global settings." +
          (process.platform === "darwin"
            ? " You can install it by running " +
              "`xcode-select --install` in the terminal."
            : "")
      );
    }
  }

  return returnPath ? gitPath || undefined : isGitInstalled;
}

/**
 * Initialize git submodules in downloaded Pico-SDK.
 *
 * @param sdkDirectory The directory of the downloaded Pico-SDK.
 * @returns True if the submodules were initialized successfully, false otherwise.
 */
export async function initSubmodules(
  sdkDirectory: string,
  gitExecutable: string = "git"
): Promise<boolean> {
  try {
    // Use the "git submodule update --init" command in the specified directory
    // `cd` command need '/d' option on Windows. (Change drive "d:\" to "c:\")
    const command =
      `cd ${
        process.env.ComSpec?.endsWith("cmd.exe") ? "/d " : " "
      }"${sdkDirectory}" && ` +
      `${
        process.env.ComSpec === "powershell.exe" ? "&" : ""
      }"${gitExecutable}" submodule update --init`;
    await execAsync(command);

    return true;
  } catch (error) {
    console.error(error);

    return false;
  }
}

export async function cloneRepository(
  repository: string,
  branch: string,
  targetDirectory: string,
  gitExecutable: string = "git"
): Promise<boolean> {
  // Clone the repository at the specified tag into the target directory
  const cloneCommand =
    `${
      process.env.ComSpec === "powershell.exe" ? "&" : ""
    }"${gitExecutable}" -c advice.detachedHead=false clone --branch ` +
    `${branch} ${repository} "${targetDirectory}"`;

  try {
    await execAsync(cloneCommand);

    Logger.log(`${repository} ${branch} has been cloned and installed.`);

    return true;
  } catch (error) {
    try {
      await unlink(targetDirectory);
    } catch {
      /* */
    }

    const err = error instanceof Error ? error.message : (error as string);
    if (err.includes("already exists")) {
      return true;
    }
    Logger.log(`Error while cloning repository: ${err}`);

    return false;
  }
}

export async function sparseCloneRepository(
  repository: string,
  branch: string,
  targetDirectory: string,
  gitExecutable: string = "git"
): Promise<boolean> {
  // Clone the repository at the specified tag into the target directory
  const cloneCommand =
    `${
      process.env.ComSpec === "powershell.exe" ? "&" : ""
    }"${gitExecutable}" -c advice.detachedHead=false clone ` +
    "--filter=blob:none --sparse --branch " +
    `${branch} ${repository} "${targetDirectory}"`;

  try {
    await execAsync(cloneCommand);
    await execAsync(
      `cd ${
        process.env.ComSpec?.endsWith("cmd.exe") ? "/d " : " "
      }"${targetDirectory}" && ${
        process.env.ComSpec === "powershell.exe" ? "&" : ""
      }"${gitExecutable}" sparse-checkout set --cone`
    );

    Logger.log(
      `${repository} ${branch} has been cloned with a sparse-checkout.`
    );

    return true;
  } catch (error) {
    try {
      await unlink(targetDirectory);
    } catch {
      /* */
    }

    const err = error instanceof Error ? error.message : (error as string);
    if (err.includes("already exists")) {
      return true;
    }
    Logger.log(`Error while cloning repository: ${err}`);

    return false;
  }
}

/**
 * Add a path to the sparse-checkout of a repository.
 *
 * @param repoDirectory The directory of the git repository (absolute).
 * @param checkoutPath The repo-relative path to add to the sparse-checkout.
 * @param gitExecutable The path to the git executable.
 * @returns True if the path was added successfully, false otherwise.
 */
export async function sparseCheckout(
  repoDirectory: string,
  checkoutPath: string,
  gitExecutable: string = "git"
): Promise<boolean> {
  try {
    await execAsync(
      `cd ${
        process.env.ComSpec?.endsWith("cmd.exe") ? "/d " : " "
      } "${repoDirectory}" && ${
        process.env.ComSpec === "powershell.exe" ? "&" : ""
      }"${gitExecutable}" sparse-checkout add ${checkoutPath}`
    );

    return true;
  } catch (error) {
    const err = error instanceof Error ? error.message : (error as string);
    Logger.log(`Error while cloning repository: ${err}`);

    return false;
  }
}
