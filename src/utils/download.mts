import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  renameSync,
  rmdirSync,
} from "fs";
import { mkdir } from "fs/promises";
import { homedir, platform, tmpdir } from "os";
import { basename, join } from "path";
import Logger from "../logger.mjs";
import { get } from "https";
import type { SupportedToolchainVersion } from "./toolchainUtil.mjs";
import { Extract as UnzipperExtract } from "unzipper";
import { exec } from "child_process";
import { cloneRepository, initSubmodules } from "./gitUtil.mjs";
import { checkForInstallationRequirements } from "./requirementsUtil.mjs";
import { Octokit } from "octokit";

export function buildToolchainPath(version: string): string {
  // TODO: maybe put homedir() into global
  return join(homedir(), ".pico-sdk", "toolchain", version);
}

export function buildSDKPath(version: string): string {
  // TODO: maybe replace . with _
  return join(homedir(), ".pico-sdk", "sdk", version);
}

export function buildNinjaPath(version: string): string {
  return join(homedir(), ".pico-sdk", "ninja", version);
}

async function unzipFile(
  zipFilePath: string,
  targetDirectory: string
): Promise<boolean> {
  const input = createReadStream(zipFilePath);

  return new Promise<boolean>(resolve => {
    try {
      input
        .pipe(UnzipperExtract({ path: targetDirectory }))
        .on("close", () => {
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

          resolve(true);
        })
        .on("error", err => {
          Logger.log("Error reading zip file: " + err?.message);
          resolve(false);
        });
    } catch (error) {
      resolve(false);
    }
  });
}

async function unxzFile(
  xzFilePath: string,
  targetDirectory: string
): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    try {
      // Construct the command to extract the .xz file using the 'tar' command
      // -J option is redundant in modern versions of tar, but it's still good for compatibility
      const command = `tar -xJf "${xzFilePath}" -C "${targetDirectory}"`;

      // Execute the 'tar' command in the shell
      exec(command, error => {
        if (error) {
          Logger.log(`Error extracting .xz file: ${error?.message}`);
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

          Logger.log(`Extracted .xz file: ${xzFilePath}`);
          resolve(true);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

export async function downloadAndInstallSDK(
  version: string,
  repositoryUrl: string
): Promise<boolean> {
  const requirementsCheck = await checkForInstallationRequirements();
  if (!requirementsCheck) {
    return false;
  }

  const targetDirectory = buildSDKPath(version);

  // Check if the SDK is already installed
  if (existsSync(targetDirectory)) {
    Logger.log(`SDK ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  //await mkdir(targetDirectory, { recursive: true });
  if (await cloneRepository(repositoryUrl, version, targetDirectory)) {
    return initSubmodules(targetDirectory);
  }

  return false;
}

export async function downloadAndInstallToolchain(
  toolchain: SupportedToolchainVersion,
  isRedirect: boolean = false
): Promise<boolean> {
  const targetDirectory = buildToolchainPath(toolchain.version);

  // Check if the SDK is already installed
  if (!isRedirect && existsSync(targetDirectory)) {
    Logger.log(`Toolchain ${toolchain.version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url for platform()_arch()
  const platformDouble = `${process.platform}_${process.arch}`;
  const downloadUrl = toolchain.downloadUrls[platformDouble];
  const basenameSplit = basename(downloadUrl).split(".");
  let artifactExt = basenameSplit.pop();
  if (artifactExt === "xz" || artifactExt === "gz") {
    artifactExt = basenameSplit.pop() + "." + artifactExt;
  }

  if (artifactExt === undefined) {
    return false;
  }

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(
    tmpBasePath,
    `${toolchain.version}.${artifactExt}`
  );

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
        Logger.log(
          "Error while downloading toolchain: " + response.statusMessage
        );

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(downloadAndInstallToolchain(toolchain, true));
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        if (artifactExt === "tar.xz" || artifactExt === "tar.gz") {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => resolve(success))
            .catch(() => {
              resolve(false);
            });
        } else if (artifactExt === "zip") {
          unzipFile(archiveFilePath, targetDirectory)
            .then(success => resolve(success))
            .catch(() => {
              resolve(false);
            });
        } else {
          Logger.log(`Error: unknown archive extension: ${artifactExt}`);
          resolve(false);
        }
      });

      response.pipe(fileWriter);
    }).on("error", () => {
      // TODO: delete directories where the archive should be extracted to
      Logger.log("Error while downloading toolchain.");

      return false;
    });
  });
}

export async function downloadAndInstallNinja(
  version: string
): Promise<boolean> {
  if (process.platform === "linux") {
    Logger.log("Ninja installation on Linux is not supported.");

    return false;
  }

  const targetDirectory = buildNinjaPath(version);

  // Check if the SDK is already installed
  if (existsSync(targetDirectory)) {
    Logger.log(`Ninja ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `${version}.zip`);

  const octokit = new Octokit();

  const releaseResponse = await octokit.rest.repos.getReleaseByTag({
    owner: "ninja-build",
    repo: "ninja",
    tag: version,
  });
  if (releaseResponse.status !== 200 && releaseResponse.data === undefined) {
    Logger.log(`Error fetching ninja release ${version}.`);

    return false;
  }
  const release = releaseResponse.data;
  const assetName = `ninja-${
    process.platform === "darwin" ? "mac" : "win"
  }.zip`;

  // Find the asset with the name 'ninja-win.zip'
  const ninjaWinAsset = release.assets.find(asset => asset.name === assetName);

  if (!ninjaWinAsset) {
    Logger.log(`Error release asset for ninja release ${version} not found.`);

    return false;
  }

  // Download the asset
  const assetUrl = ninjaWinAsset.browser_download_url;

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(assetUrl, response => {
      const code = response.statusCode ?? 0;

      // redirects not supported
      if (code >= 300) {
        //return reject(new Error(response.statusMessage));
        Logger.log(
          "Error while downloading toolchain: " + response.statusMessage
        );

        return resolve(false);
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        unzipFile(archiveFilePath, targetDirectory)
          .then(success => resolve(success))
          .catch(() => {
            resolve(false);
          });
      });

      response.pipe(fileWriter);
    }).on("error", error => {
      console.error("Error downloading asset:", error.message);
      resolve(false);
    });
  });
}
