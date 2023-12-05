import {
  createWriteStream,
  existsSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from "fs";
import { mkdir } from "fs/promises";
import { homedir, tmpdir } from "os";
import { basename, join } from "path";
import Logger from "../logger.mjs";
import { get } from "https";
import type { SupportedToolchainVersion } from "./toolchainUtil.mjs";
import { exec } from "child_process";
import { cloneRepository, initSubmodules } from "./gitUtil.mjs";
import { checkForInstallationRequirements } from "./requirementsUtil.mjs";
import { Octokit } from "octokit";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import type Settings from "../settings.mjs";
import AdmZip from "adm-zip";
import type { VersionBundle } from "./versionBundles.mjs";
import MacOSPythonPkgExtractor from "./macOSUtils.mjs";
import which from "which";
import { window } from "vscode";

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

export function buildCMakePath(version: string): string {
  return join(homedir(), ".pico-sdk", "cmake", version);
}

export function buildPython3Path(version: string): string {
  return join(homedir(), ".pico-sdk", "python", version);
}

function unzipFile(zipFilePath: string, targetDirectory: string): boolean {
  try {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(targetDirectory, true, true);

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
async function unxzFile(
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

export async function downloadAndInstallSDK(
  version: string,
  repositoryUrl: string,
  settings: Settings
): Promise<boolean> {
  const gitExecutable =
    settings.getString(SettingsKey.gitPath)?.replace(HOME_VAR, homedir()) ||
    "git";

  const requirementsCheck = await checkForInstallationRequirements(
    settings,
    gitExecutable
  );
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
  const gitPath = await which(gitExecutable, { nothrow: true });
  if (gitPath === null) {
    // try to install git
    if (!(await downloadGit())) {
      Logger.log("Error: Git is not installed and could not be downloaded.");

      return false;
    }
  }
  // using deferred execution to avoid git clone if git is not available
  if (
    gitPath !== null &&
    (await cloneRepository(
      repositoryUrl,
      version,
      targetDirectory,
      gitExecutable
    ))
  ) {
    // check python requirements
    const python3Exe: string =
      settings
        .getString(SettingsKey.python3Path)
        ?.replace(HOME_VAR, homedir()) || process.platform === "win32"
        ? "python"
        : "python3";
    const python3: string | null = await which(python3Exe, { nothrow: true });

    if (python3 === null) {
      Logger.log(
        "Error: Python3 is not installed and could not be downloaded."
      );

      void window.showErrorMessage("Python3 is not installed and in PATH.");

      return false;
    }

    return initSubmodules(targetDirectory, gitExecutable);
  }

  return false;
}

export async function downloadAndInstallToolchain(
  toolchain: SupportedToolchainVersion,
  redirectURL?: string
): Promise<boolean> {
  const targetDirectory = buildToolchainPath(toolchain.version);

  // Check if the SDK is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`Toolchain ${toolchain.version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url for platform()_arch()
  const platformDouble = `${process.platform}_${process.arch}`;
  const downloadUrl = redirectURL ?? toolchain.downloadUrls[platformDouble];
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
      const code = response.statusCode ?? 404;

      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log(
          "Error while downloading toolchain: " + response.statusMessage
        );

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallToolchain(toolchain, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        if (artifactExt === "tar.xz" || artifactExt === "tar.gz") {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              // delete tmp file
              unlinkSync(archiveFilePath);
              resolve(success);
            })
            .catch(() => {
              unlinkSync(archiveFilePath);
              unlinkSync(targetDirectory);
              resolve(false);
            });
        } else if (artifactExt === "zip") {
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          unlinkSync(archiveFilePath);
          if (!success) {
            unlinkSync(targetDirectory);
          }
          resolve(success);
        } else {
          unlinkSync(archiveFilePath);
          unlinkSync(targetDirectory);
          Logger.log(`Error: unknown archive extension: ${artifactExt}`);
          resolve(false);
        }
      });

      response.pipe(fileWriter);
    }).on("error", () => {
      // clean
      unlinkSync(archiveFilePath);
      unlinkSync(targetDirectory);
      Logger.log("Error while downloading toolchain.");

      return false;
    });
  });
}

export async function downloadAndInstallNinja(
  version: string,
  redirectURL?: string
): Promise<boolean> {
  /*if (process.platform === "linux") {
    Logger.log("Ninja installation on Linux is not supported.");

    return false;
  }*/

  const targetDirectory = buildNinjaPath(version);

  // Check if the SDK is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`Ninja ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `ninja.zip`);

  const octokit = new Octokit();
  let ninjaAsset: { name: string; browser_download_url: string } | undefined;

  try {
    if (redirectURL === undefined) {
      const releaseResponse = await octokit.rest.repos.getReleaseByTag({
        owner: "ninja-build",
        repo: "ninja",
        tag: version,
      });
      if (
        releaseResponse.status !== 200 &&
        releaseResponse.data === undefined
      ) {
        Logger.log(`Error fetching ninja release ${version}.`);

        return false;
      }
      const release = releaseResponse.data;
      const assetName = `ninja-${
        process.platform === "darwin"
          ? "mac"
          : process.platform === "win32"
          ? "win"
          : "lin"
      }.zip`;

      // Find the asset with the name 'ninja-win.zip'
      ninjaAsset = release.assets.find(asset => asset.name === assetName);
    } else {
      ninjaAsset = {
        name: version,
        browser_download_url: redirectURL,
      };
    }
  } catch (error) {
    Logger.log(
      `Error fetching ninja release ${version}. ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }

  if (!ninjaAsset) {
    Logger.log(`Error release asset for ninja release ${version} not found.`);

    return false;
  }

  // Download the asset
  const assetUrl = ninjaAsset.browser_download_url;

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(assetUrl, response => {
      const code = response.statusCode ?? 404;

      // redirects not supported
      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log("Error while downloading ninja: " + response.statusMessage);

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallNinja(version, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        const success = unzipFile(archiveFilePath, targetDirectory);

        // delete tmp file
        unlinkSync(archiveFilePath);

        // unzipper would require custom permission handling as it
        // doesn't preserve the executable flag
        /*if (process.platform !== "win32") {
          chmodSync(join(targetDirectory, "ninja"), 0o755);
        }*/

        resolve(success);
      });

      response.pipe(fileWriter);
    }).on("error", error => {
      Logger.log("Error downloading asset:" + error.message);
      resolve(false);
    });
  });
}

/**
 * Supports Windows and macOS amd64 and arm64.
 *
 * @param version
 * @returns
 */
export async function downloadAndInstallCmake(
  version: string,
  redirectURL?: string
): Promise<boolean> {
  /*if (process.platform === "linux") {
    Logger.log("CMake installation on Linux is not supported.");

    return false;
  }*/

  const targetDirectory = buildCMakePath(version);

  // Check if the SDK is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`CMake ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });
  const assetExt = process.platform === "win32" ? "zip" : "tar.gz";

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `cmake-${version}.${assetExt}`);

  const octokit = new Octokit();

  // eslint-disable-next-line @typescript-eslint/naming-convention
  let cmakeAsset: { name: string; browser_download_url: string } | undefined;

  try {
    if (redirectURL === undefined) {
      const releaseResponse = await octokit.rest.repos.getReleaseByTag({
        owner: "Kitware",
        repo: "CMake",
        tag: version,
      });
      if (
        releaseResponse.status !== 200 &&
        releaseResponse.data === undefined
      ) {
        Logger.log(`Error fetching CMake release ${version}.`);

        return false;
      }
      const release = releaseResponse.data;
      const assetName = `cmake-${version.replace("v", "")}-${
        process.platform === "darwin" ? "macos" : "windows"
      }-${
        process.platform === "darwin"
          ? "universal"
          : process.arch === "arm64"
          ? process.platform === "linux"
            ? "aarch64"
            : "arm64"
          : "x86_64"
      }.${assetExt}`;

      cmakeAsset = release.assets.find(asset => asset.name === assetName);
    } else {
      cmakeAsset = {
        name: version,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        browser_download_url: redirectURL,
      };
    }
  } catch (error) {
    Logger.log(
      `Error fetching CMake release ${version}. ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }

  if (!cmakeAsset) {
    Logger.log(`Error release asset for cmake release ${version} not found.`);

    return false;
  }

  // Download the asset
  const assetUrl = cmakeAsset.browser_download_url;

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(assetUrl, response => {
      const code = response.statusCode ?? 0;

      // redirects not supported
      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log(
          "Error while downloading toolchain: " + response.statusMessage
        );

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallCmake(version, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        if (process.platform === "darwin" || process.platform === "linux") {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              // delete tmp file
              unlinkSync(archiveFilePath);
              // macOS
              //chmodSync(join(targetDirectory, "CMake.app", "Contents", "bin", "cmake"), 0o755);
              resolve(success);
            })
            .catch(() => {
              unlinkSync(archiveFilePath);
              unlinkSync(targetDirectory);
              resolve(false);
            });
        } else if (process.platform === "win32") {
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          unlinkSync(archiveFilePath);
          resolve(success);
        } else {
          Logger.log(`Error: platform not supported for downloading cmake.`);
          unlinkSync(archiveFilePath);
          unlinkSync(targetDirectory);

          resolve(false);
        }
      });

      response.pipe(fileWriter);
    }).on("error", error => {
      Logger.log("Error downloading asset: " + error.message);
      resolve(false);
    });
  });
}

/**
 * Only supported Windows amd64 and arm64.
 *
 * @returns
 */
export async function downloadEmbedPython(
  versionBundle: VersionBundle
): Promise<string | undefined> {
  if (
    process.platform === "linux" ||
    (process.platform === "win32" && process.arch !== "x64")
  ) {
    Logger.log(
      "Embed Python installation on Windows x64 and macOS arm64 only."
    );

    return;
  }

  const targetDirectory = buildPython3Path(versionBundle.python.version);
  const settingsTargetDirectory =
    `${HOME_VAR}/.pico-sdk` + `/python/${versionBundle.python.version}`;

  // Check if the Embed Python is already installed
  if (existsSync(targetDirectory)) {
    Logger.log(`Embed correct Python is already installed.`);

    // TODO: move into helper function
    return (
      `${settingsTargetDirectory}/Versions/` +
      `${versionBundle.python.version.substring(
        0,
        versionBundle.python.version.lastIndexOf(".")
      )}/bin/python3`
    );
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url for platform()_arch()
  const downloadUrl =
    process.platform === "darwin"
      ? versionBundle.python.macos
      : versionBundle.python.windowsAmd64;

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(
    tmpBasePath,
    `python-${versionBundle.python.version}.${
      process.platform === "darwin" ? "pkg" : "zip"
    }`
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
        Logger.log("Error while downloading python: " + response.statusMessage);

        return resolve(undefined);
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        if (process.platform === "darwin") {
          const pkgExtractor = new MacOSPythonPkgExtractor(
            archiveFilePath,
            targetDirectory
          );

          pkgExtractor
            .extractPkg()
            .then(success => {
              if (versionBundle.python.version.lastIndexOf(".") <= 2) {
                Logger.log(
                  "Error while extracting Python: " +
                    "Python version has wrong format."
                );
                resolve(undefined);
              }

              resolve(
                success
                  ? `${settingsTargetDirectory}/Versions/` +
                      `${versionBundle.python.version.substring(
                        0,
                        versionBundle.python.version.lastIndexOf(".")
                      )}/bin/python3`
                  : undefined
              );
            })
            .catch(() => {
              resolve(undefined);
            });
        } else {
          // unpack the archive
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          unlinkSync(archiveFilePath);
          resolve(
            success ? `${settingsTargetDirectory}/python.exe` : undefined
          );
        }
      });

      response.pipe(fileWriter);
    }).on("error", () => {
      Logger.log("Error while downloading Embed Python.");

      return false;
    });
  });
}

const GIT_DOWNLOAD_URL_WIN_AMD64 =
  "https://github.com/git-for-windows/git/releases/download" +
  "/v2.43.0.windows.1/MinGit-2.43.0-64-bit.zip";
const GIT_MACOS_VERSION = "2.43.0";
const GIT_DOWNLOAD_URL_MACOS_ARM64 = "git-2.43.0-arm64_sonoma.bottle.tar.gz";
const GIT_DOWNLOAD_URL_MACOS_INTEL = "git-2.43.0-intel_sonoma.bottle.tar.gz";

/**
 * Only supported Windows amd64 and macOS arm64 and amd64.
 *
 * @returns
 */
export async function downloadGit(): Promise<string | undefined> {
  if (
    process.platform === "linux" ||
    (process.platform === "win32" && process.arch !== "x64")
  ) {
    Logger.log("Git installation on Windows x64 and macOS only.");

    return;
  }

  const targetDirectory = join(homedir(), ".pico-sdk", "git");
  const settingsTargetDirectory = `${HOME_VAR}/.pico-sdk/git`;

  // Check if the Embed Python is already installed
  if (existsSync(targetDirectory)) {
    Logger.log(`Git is already installed.`);

    return `${settingsTargetDirectory}/git` + `/${GIT_MACOS_VERSION}/bin/git`;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url for platform()_arch()
  const downloadUrl =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? GIT_DOWNLOAD_URL_MACOS_ARM64
        : GIT_DOWNLOAD_URL_MACOS_INTEL
      : GIT_DOWNLOAD_URL_WIN_AMD64;

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(
    tmpBasePath,
    `git.${process.platform === "darwin" ? "tar.gz" : "zip"}`
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
        Logger.log("Error while downloading git: " + response.statusMessage);

        resolve(undefined);
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        if (process.platform === "darwin") {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              unlinkSync(archiveFilePath);
              resolve(
                success
                  ? `${settingsTargetDirectory}/git` +
                      `/${GIT_MACOS_VERSION}/bin/git`
                  : undefined
              );
            })
            .catch(() => {
              resolve(undefined);
            });
        } else {
          // unpack the archive
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          unlinkSync(archiveFilePath);
          resolve(
            success ? `${settingsTargetDirectory}/cmd/git.exe` : undefined
          );
        }
      });

      response.pipe(fileWriter);
    }).on("error", () => {
      Logger.log("Error while downloading git.");

      return false;
    });
  });
}
