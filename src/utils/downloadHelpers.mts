import { readdirSync, renameSync, rmdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { join as joinPosix } from "path/posix";
import Logger, { LoggerSource } from "../logger.mjs";
import { exec } from "child_process";
import AdmZip from "adm-zip";
import { request } from "https";
import { fileURLToPath } from "url";
import { unknownErrorToString } from "./errorHelper.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

export function getDataRoot(): string {
  return joinPosix(
    dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/"),
    "..",
    "data",
    CURRENT_DATA_VERSION
  );
}

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
        Logger.error(
          LoggerSource.downloadHelper,
          "Extracting archive file failed:",
          unknownErrorToString(error)
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
  enforceSuccess: boolean = false
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
      targetDirContents.length === 1 &&
      statSync(subfolderPath).isDirectory()
    ) {
      // Move all files and folders from the subfolder to targetDirectory
      readdirSync(subfolderPath).forEach(item => {
        const itemPath = join(subfolderPath, item);
        const newItemPath = join(targetDirectory, item);

        // Use fs.renameSync to move the item
        renameSync(itemPath, newItemPath);
      });

      // Remove the empty subfolder
      rmdirSync(subfolderPath);
    }

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.downloadHelper,
      "Extracting archive file failed:",
      unknownErrorToString(error)
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
          Logger.debug(
            LoggerSource.downloadHelper,
            "Error extracting archive file:",
            error?.message
          );
          resolve(false);
        } else {
          const targetDirContents = readdirSync(targetDirectory);
          const subfolderPath =
            targetDirContents.length === 1
              ? join(targetDirectory, targetDirContents[0])
              : "";
          if (
            targetDirContents.length === 1 &&
            statSync(subfolderPath).isDirectory()
          ) {
            // Move all files and folders from the subfolder to targetDirectory
            readdirSync(subfolderPath).forEach(item => {
              const itemPath = join(subfolderPath, item);
              const newItemPath = join(targetDirectory, item);

              // Use fs.renameSync to move the item
              renameSync(itemPath, newItemPath);
            });

            // Remove the empty subfolder
            rmdirSync(subfolderPath);
          }

          Logger.debug(
            LoggerSource.downloadHelper,
            "Extracted archive file:",
            xzFilePath
          );
          resolve(true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Checks if the internet connection is available (at least to pages.github.com).
 *
 * @returns True if the internet connection is available, false otherwise.
 */
export async function isInternetConnected(): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const options = {
      host: "pages.github.com",
      port: 443,
      path: "/?",
      method: "HEAD",
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Host: "pages.github.com",
      },
    };

    const req = request(options, res => {
      resolve(res.statusCode === 200);
    });

    req.on("error", () => {
      resolve(false);
    });

    req.end();
  });
}
