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

  const installerFile = createWriteStream(destinationPath);

  return new Promise<void>((resolve, reject) => {
    httpsGet(url, response => {
      response.pipe(installerFile);

      installerFile.on("finish", () => {
        installerFile.close();

        resolve();
      });
    }).on("error", error => {
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
    const silentArgs = "/S"; // Specify the silent mode argument

    const child = spawn(installerPath, [silentArgs]);

    child.on("error", error => {
      console.error(
        `Failed to execute installer "${installerName}": ${error.message}`
      );
      reject(error);
    });

    child.on("exit", code => {
      if (code === 0) {
        console.log(`Installer "${installerName}" executed successfully.`);
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
    Logger.log(`Installation of SDK v${version} finished.`);

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
