import { createWriteStream, existsSync, rmSync } from "fs";
import { mkdir } from "fs/promises";
import { homedir, tmpdir } from "os";
import { join } from "path";
import Logger from "../logger.mjs";
import { get } from "https";
import { exec } from "child_process";
import { HOME_VAR } from "../settings.mjs";
import { unxzFile, unzipFile } from "./downloadHelpers.mjs";

// TODO: extracted from download.mts to resolved circular dependency

const GIT_DOWNLOAD_URL_WIN_AMD64 =
  "https://github.com/git-for-windows/git/releases/download" +
  "/v2.43.0.windows.1/MinGit-2.43.0-64-bit.zip";

/**
 * Only supported Windows amd64 and macOS arm64 and amd64.
 *
 * @returns
 */
export async function downloadGit(
  redirectURL?: string
): Promise<string | undefined> {
  if (
    process.platform !== "win32" ||
    (process.platform === "win32" && process.arch !== "x64")
  ) {
    Logger.log("Git installation on Windows x64 and macOS only.");

    return;
  }

  const targetDirectory = join(homedir(), ".pico-sdk", "git");
  const settingsTargetDirectory = `${HOME_VAR}/.pico-sdk/git`;

  // Check if the Embed Python is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`Git is already installed.`);

    return process.platform === "win32"
      ? `${settingsTargetDirectory}/cmd/git.exe`
      : `${settingsTargetDirectory}/bin/git`;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url for platform()_arch()
  const downloadUrl = redirectURL ?? GIT_DOWNLOAD_URL_WIN_AMD64;

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `git.zip`);

  return new Promise(resolve => {
    const requestOptions = {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": "VSCode-RaspberryPi-Pico-Extension",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: "*/*",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Accept-Encoding": "gzip, deflate, br",
      },
    };

    get(downloadUrl, requestOptions, response => {
      const code = response.statusCode ?? 0;

      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log("Error while downloading git: " + response.statusMessage);

        resolve(undefined);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(downloadGit(response.headers.location));
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // TODO: remove unused code-path here
        if (process.platform === "darwin") {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              rmSync(archiveFilePath, { recursive: true, force: true });
              resolve(
                success ? `${settingsTargetDirectory}/bin/git` : undefined
              );
            })
            .catch(() => {
              resolve(undefined);
            });
        } else {
          // unpack the archive
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          rmSync(archiveFilePath, { recursive: true, force: true });

          if (success) {
            // remove include section from gitconfig included in MiniGit
            // which hardcodes the a path in Programm Files to be used by this git executable
            exec(
              `${
                process.env.ComSpec === "powershell.exe" ? "&" : ""
              }"${targetDirectory}/cmd/git.exe" config ` +
                `--file "${targetDirectory}/etc/gitconfig" ` +
                "--remove-section include",
              error => {
                if (error) {
                  Logger.log(
                    `Error executing git: ${
                      error instanceof Error ? error.message : (error as string)
                    }`
                  );
                  resolve(undefined);
                } else {
                  resolve(`${settingsTargetDirectory}/cmd/git.exe`);
                }
              }
            );
          } else {
            resolve(undefined);
          }
        }
      });

      response.pipe(fileWriter);
    }).on("error", () => {
      Logger.log("Error while downloading git.");

      return false;
    });
  });
}
