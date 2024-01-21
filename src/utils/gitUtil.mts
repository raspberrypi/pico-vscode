import { promisify } from "util";
import { exec } from "child_process";
import Logger from "../logger.mjs";
import { unlink } from "fs/promises";

const execAsync = promisify(exec);

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
    const command =
      `cd "${sdkDirectory}" && ` +
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
      `cd "${targetDirectory}" && ${
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
      `cd "${repoDirectory}" && ` +
        `${gitExecutable} sparse-checkout add ${checkoutPath}`
    );

    return true;
  } catch (error) {
    const err = error instanceof Error ? error.message : (error as string);
    Logger.log(`Error while cloning repository: ${err}`);

    return false;
  }
}
