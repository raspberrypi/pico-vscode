import { promisify } from "util";
import { exec } from "child_process";
import Logger from "../logger.mjs";

const execAsync = promisify(exec);

/**
 * Initialize git submodules in downloaded Pico-SDK.
 *
 * @param sdkDirectory The directory of the downloaded Pico-SDK.
 * @returns True if the submodules were initialized successfully, false otherwise.
 */
export async function initSubmodules(sdkDirectory: string): Promise<boolean> {
  try {
    // Use the "git submodule update --init" command in the specified directory
    const command = `cd ${sdkDirectory} && git submodule update --init`;
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
  targetDirectory: string
): Promise<boolean> {
  // Clone the repository at the specified tag into the target directory
  const cloneCommand =
    "git -c advice.detachedHead=false clone --branch " +
    `${branch} ${repository} ${targetDirectory}`;

  try {
    await execAsync(cloneCommand);

    Logger.log(`SDK ${branch} has been cloned and installed.`);

    return true;
  } catch (error) {
    const err = error instanceof Error ? error.message : (error as string);
    Logger.log(`Error while cloning SDK: ${err}`);

    return false;
  }
}
