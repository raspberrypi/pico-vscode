import { readdirSync, renameSync, rmdirSync, statSync } from "fs";
import { join } from "path";
import Logger from "../logger.mjs";
import { exec } from "child_process";
import AdmZip from "adm-zip";

export function tryUnzipFiles(
  zipFilePath: string,
  targetDirectory: string
): boolean {
  let success = true;
  const zip = new AdmZip(zipFilePath);
  const zipEntries = zip.getEntries();
  zipEntries.forEach(function (zipEntry) {
    if (!zipEntry.isDirectory) {
      try {
        zip.extractEntryTo(zipEntry, targetDirectory, true, true, true);
      } catch (error) {
        Logger.log(
          `Error extracting archive file: ${
            error instanceof Error ? error.message : (error as string)
          }`
        );
        success = false;
      }
    }
  });

  return success;
}

export function unzipFile(
  zipFilePath: string,
  targetDirectory: string,
  enforceSuccess: boolean = true
): boolean {
  try {
    if (enforceSuccess) {
      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(targetDirectory, true, true);
    } else {
      tryUnzipFiles(zipFilePath, targetDirectory);
    }

    // TODO: improve this
    const targetDirContents = readdirSync(targetDirectory);
    const subfolderPath =
      targetDirContents.length === 1
        ? join(targetDirectory, targetDirContents[0])
        : "";
    if (
      process.platform === "win32" &&
      targetDirContents.length === 1 &&
      statSync(subfolderPath).isDirectory()
    ) {
      readdirSync(subfolderPath).forEach(item => {
        const itemPath = join(subfolderPath, item);
        const newItemPath = join(targetDirectory, item);

        // Use fs.renameSync to move the item
        renameSync(itemPath, newItemPath);
      });
      rmdirSync(subfolderPath);
    }

    return true;
  } catch (error) {
    Logger.log(
      `Error extracting archive file: ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }
}

/**
 * Extracts a .xz file using the 'tar' command.
 *
 * Also supports tar.gz files.
 *
 * Linux and macOS only.
 *
 * @param xzFilePath
 * @param targetDirectory
 * @returns
 */
export async function unxzFile(
  xzFilePath: string,
  targetDirectory: string
): Promise<boolean> {
  if (process.platform === "win32") {
    return false;
  }

  return new Promise<boolean>(resolve => {
    try {
      // Construct the command to extract the .xz file using the 'tar' command
      // -J option is redundant in modern versions of tar, but it's still good for compatibility
      const command = `tar -x${
        xzFilePath.endsWith(".xz") ? "J" : "z"
      }f "${xzFilePath}" -C "${targetDirectory}"`;

      // Execute the 'tar' command in the shell
      exec(command, error => {
        if (error) {
          Logger.log(`Error extracting archive file: ${error?.message}`);
          resolve(false);
        } else {
          // Assuming there's only one subfolder in targetDirectory
          const subfolder = readdirSync(targetDirectory)[0];
          const subfolderPath = join(targetDirectory, subfolder);

          // Move all files and folders from the subfolder to targetDirectory
          readdirSync(subfolderPath).forEach(item => {
            const itemPath = join(subfolderPath, item);
            const newItemPath = join(targetDirectory, item);

            // Use fs.renameSync to move the item
            renameSync(itemPath, newItemPath);
          });

          // Remove the empty subfolder
          rmdirSync(subfolderPath);

          Logger.log(`Extracted archive file: ${xzFilePath}`);
          resolve(true);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}
