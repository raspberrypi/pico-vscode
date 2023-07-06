import { createWriteStream, unlink } from "fs";
import { tmpdir } from "os";
import { get as httpsGet } from "https";
import { basename, join } from "path";
import Logger from "../logger.mjs";
import { spawn } from "child_process";

async function downloadWindowsInstaller(
  version: string,
  destinationPath: string
): Promise<void> {
  const url =
    "https://github.com/raspberrypi/pico-setup-windows/releases" +
    `/download/v${version}/pico-setup-windows-x64-standalone.exe`;

  //const installerFile = createWriteStream(destinationPath);

  const installerFile = createWriteStream(destinationPath);

  return new Promise<void>((resolve, reject) => {
    const request = httpsGet(url, response => {
      if (response.statusCode === 302) {
        const redirectedUrl = response.headers.location || "";
        httpsGet(redirectedUrl, redirectedResponse => {
          redirectedResponse.pipe(installerFile);

          redirectedResponse.on("end", () => {
            installerFile.on("finish", () => {
              installerFile.close();
              console.log(`File downloaded!`);
              resolve();
            });
          });

          redirectedResponse.on("error", error => {
            unlink(destinationPath, () => {
              /* nothing */
            });

            reject(error);
          });
        });
      } else {
        response.pipe(installerFile);

        response.on("end", () => {
          installerFile.on("finish", () => {
            installerFile.close();
            console.log(`File downloaded!`);
            resolve();
          });
        });

        response.on("error", error => {
          unlink(destinationPath, () => {
            /* nothing */
          });

          reject(error);
        });
      }
    });

    request.on("error", error => {
      unlink(destinationPath, () => {
        /* nothing */
      });

      reject(error);
    });
  });
}

async function runInstaller(installerPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installerName = basename(installerPath);
    // cant spawn installer directly and with silent falg because error EACCESS
    //const silentArgs = "/S"; // Specify the silent mode argument

    const child = spawn("explorer.exe", [installerPath], {
      cwd: tmpdir(),
      windowsHide: false,
      env: process.env,
      detached: true,
    });

    child.on("error", error => {
      console.error(
        `Failed to execute installer "${installerName}": ${error.message}`
      );
      reject(error);
    });

    child.on("exit", code => {
      if (code === 0) {
        console.log(`Installer "${installerName}" started successfully.`);
        resolve();
      } else {
        console.error(
          `Installer "${installerName}" exited with code ${code ?? "N/A"}.`
        );
        reject(
          new Error(
            `Installer "${installerName}" exited with code ${code ?? "N/A"}.`
          )
        );
      }
    });
  });
}

export async function downloadAndInstallPicoSDKWindows(
  version: string
): Promise<boolean> {
  const destinationPath = join(
    tmpdir(),
    "pico-setup-windows-x64-standalone.exe"
  );

  try {
    await downloadWindowsInstaller(version, destinationPath);
    Logger.log(`Download of installer v${version} finished.`);

    await runInstaller(destinationPath);
    Logger.log(`Installation of SDK v${version} started.`);

    return true;
  } catch (error) {
    Logger.log(
      `[ERROR] Download and/or installation of SDK v${version} failed: ${
        (error as Error).message
      }`
    );

    return false;
  }
}
