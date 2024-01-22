import { createWriteStream, existsSync, symlinkSync, unlinkSync } from "fs";
import { mkdir } from "fs/promises";
import { homedir, tmpdir } from "os";
import { basename, dirname, join } from "path";
import { join as joinPosix } from "path/posix";
import Logger from "../logger.mjs";
import { get } from "https";
import type { SupportedToolchainVersion } from "./toolchainUtil.mjs";
import { cloneRepository, initSubmodules } from "./gitUtil.mjs";
import { checkForInstallationRequirements } from "./requirementsUtil.mjs";
import { HOME_VAR, SettingsKey } from "../settings.mjs";
import Settings from "../settings.mjs";
import type { VersionBundle } from "./versionBundles.mjs";
import MacOSPythonPkgExtractor from "./macOSUtils.mjs";
import which from "which";
import { window } from "vscode";
import { fileURLToPath } from "url";
import {
  type GithubReleaseAssetData,
  GithubRepository,
  getGithubReleaseByTag,
} from "./githubREST.mjs";
import { unxzFile, unzipFile } from "./downloadHelpers.mjs";

/// Translate nodejs platform names to ninja platform names
const NINJA_PLATFORMS: { [key: string]: string } = {
  darwin: "mac",
  linux: "lin",
  win32: "win",
};

/// Translate nodejs platform names to ninja platform names
const TOOLS_PLATFORMS: { [key: string]: string } = {
  darwin: "mac",
  linux: "lin",
  win32: "x64-win",
};

/// Translate nodejs platform names to cmake platform names
const CMAKE_PLATFORMS: { [key: string]: string } = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

export function buildToolchainPath(version: string): string {
  // TODO: maybe put homedir() into a global
  return joinPosix(homedir(), ".pico-sdk", "toolchain", version);
}

export function buildSDKPath(version: string): string {
  // TODO: maybe replace . with _
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "sdk",
    version
  );
}

export function buildToolsPath(version: string): string {
  // TODO: maybe replace . with _
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "tools",
    version
  );
}

export function getScriptsRoot(): string {
  return joinPosix(
    dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/"),
    "..",
    "scripts"
  );
}

export function buildNinjaPath(version: string): string {
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "ninja",
    version
  );
}

export function buildOpenOCDPath(version: string): string {
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "openocd",
    version
  );
}

export function buildCMakePath(version: string): string {
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "cmake",
    version
  );
}

export function buildPython3Path(version: string): string {
  return joinPosix(
    homedir().replaceAll("\\", "/"),
    ".pico-sdk",
    "python",
    version
  );
}

export async function downloadAndInstallSDK(
  version: string,
  repositoryUrl: string,
  python3Path?: string
): Promise<boolean> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.log("Error: Settings not initialized.");

    return false;
  }

  let gitExecutable: string | undefined =
    settings
      .getString(SettingsKey.gitPath)
      ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) || "git";

  // TODO: this does take about 2s - may be reduced
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
    // if git is not in path then checkForInstallationRequirements
    // maye downloaded it, so reload
    //settings.reload();
    gitExecutable = settings
      .getString(SettingsKey.gitPath)
      ?.replace(HOME_VAR, homedir().replaceAll("\\", "/"));
    if (gitExecutable === null) {
      Logger.log("Error: Git not found.");

      await window.showErrorMessage(
        "Git not found. Please install and add to PATH or " +
          "set the path to the git executable in global settings."
      );

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
    settings.reload();
    // check python requirements
    const python3Exe: string =
      python3Path ||
      settings
        .getString(SettingsKey.python3Path)
        ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) ||
      (process.platform === "win32" ? "python" : "python3");
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

export async function downloadAndInstallTools(
  version: string,
  required: boolean,
  redirectURL?: string
): Promise<boolean> {
  if (process.platform !== "win32") {
    Logger.log("SDK Tools installation not on Windows is not supported.");

    return !required;
  }

  const targetDirectory = buildToolsPath(version);

  // Check if the SDK is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`SDK Tools ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `sdk-tools.zip`);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  let sdkToolsAsset: GithubReleaseAssetData | undefined;

  try {
    if (redirectURL === undefined) {
      const release = await getGithubReleaseByTag(
        GithubRepository.tools,
        "v1.5.1-alpha-1"
      );
      if (release === undefined) {
        return false;
      }
      const assetName = `pico-sdk-tools-${version}-${
        TOOLS_PLATFORMS[process.platform]
      }.zip`;

      // Find the asset
      Logger.log(release.assetsUrl);
      sdkToolsAsset = release.assets.find(asset => asset.name === assetName);
    } else {
      sdkToolsAsset = {
        name: version,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        browser_download_url: redirectURL,
      };
    }
  } catch (error) {
    Logger.log(
      `Error fetching SDK Tools release ${version}. ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }

  if (!sdkToolsAsset) {
    Logger.log(
      `Error release asset for SDK Tools release ${version} not found.`
    );

    return false;
  }

  // Download the asset
  const assetUrl = sdkToolsAsset.browser_download_url;

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(assetUrl, response => {
      const code = response.statusCode ?? 404;

      // redirects not supported
      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log("Error downloading SDK Tools: " + response.statusMessage);

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallTools(version, required, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        const success = unzipFile(archiveFilePath, targetDirectory, false);

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

  // eslint-disable-next-line @typescript-eslint/naming-convention
  let ninjaAsset: GithubReleaseAssetData | undefined;

  try {
    if (redirectURL === undefined) {
      const release = await getGithubReleaseByTag(
        GithubRepository.ninja,
        version
      );
      if (release === undefined) {
        return false;
      }

      const assetName = `ninja-${NINJA_PLATFORMS[process.platform]}.zip`;
      // Find the asset with the name 'ninja-win.zip'
      ninjaAsset = release.assets.find(asset => asset.name === assetName);
    } else {
      ninjaAsset = {
        name: version,
        // eslint-disable-next-line @typescript-eslint/naming-convention
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

export async function downloadAndInstallOpenOCD(
  version: string,
  redirectURL?: string
): Promise<boolean> {
  if (process.platform !== "win32") {
    Logger.log("OpenOCD installation not on Windows is not supported.");

    return false;
  }

  const targetDirectory = buildOpenOCDPath(version);

  // Check if the SDK is already installed
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`OpenOCD ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, `openocd.zip`);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  let openocdAsset: GithubReleaseAssetData | undefined;

  try {
    if (redirectURL === undefined) {
      const release = await getGithubReleaseByTag(
        GithubRepository.tools,
        "v1.5.1-alpha-1"
      );
      if (release === undefined) {
        return false;
      }

      const assetName = `openocd-${version}-${
        TOOLS_PLATFORMS[process.platform]
      }.zip`;

      // Find the asset
      Logger.log(release.assetsUrl);
      openocdAsset = release.assets.find(asset => asset.name === assetName);
    } else {
      openocdAsset = {
        name: version,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        browser_download_url: redirectURL,
      };
    }
  } catch (error) {
    Logger.log(
      `Error fetching OpenOCD release ${version}. ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }

  if (!openocdAsset) {
    Logger.log(`Error release asset for OpenOCD release ${version} not found.`);

    return false;
  }

  // Download the asset
  const assetUrl = openocdAsset.browser_download_url;

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(assetUrl, response => {
      const code = response.statusCode ?? 404;

      // redirects not supported
      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log("Error downloading OpenOCD: " + response.statusMessage);

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallOpenOCD(version, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        const success = unzipFile(archiveFilePath, targetDirectory, false);

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

  // eslint-disable-next-line @typescript-eslint/naming-convention
  let cmakeAsset: GithubReleaseAssetData | undefined;

  try {
    if (redirectURL === undefined) {
      const release = await getGithubReleaseByTag(
        GithubRepository.cmake,
        version
      );
      if (release === undefined) {
        return false;
      }

      const assetName = `cmake-${version.replace("v", "")}-${
        CMAKE_PLATFORMS[process.platform]
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

              // on macOS the download includes an app bundle
              // create a symlink so it has the same paths as on other platforms
              if (process.platform === "darwin") {
                symlinkSync(
                  join(targetDirectory, "CMake.app", "Contents", "bin"),
                  join(targetDirectory, "bin"),
                  "dir"
                );
              }

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
  versionBundle: VersionBundle,
  redirectURL?: string
): Promise<string | undefined> {
  if (
    // even tough this function supports downloading python3 on macOS arm64
    // it doesn't work correctly therefore it's excluded here
    // use pyenvInstallPython instead
    process.platform !== "win32" ||
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
  if (redirectURL === undefined && existsSync(targetDirectory)) {
    Logger.log(`Embed Python is already installed correctly.`);

    return `${settingsTargetDirectory}/python.exe`;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url
  const downloadUrl = versionBundle.python.windowsAmd64;

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(
    tmpBasePath,
    `python-${versionBundle.python.version}.zip`
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

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadEmbedPython(versionBundle, response.headers.location)
        );
      }

      // save the file to disk
      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // doesn't work correctly therefore use pyenvInstallPython instead
        // TODO: remove unused darwin code-path here
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

              if (success) {
                try {
                  // create symlink, so the same path can be used as on Windows
                  const srcPath = joinPosix(
                    settingsTargetDirectory,
                    "/Versions/",
                    versionBundle.python.version.substring(
                      0,
                      versionBundle.python.version.lastIndexOf(".")
                    ),
                    "bin",
                    "python3"
                  );
                  symlinkSync(
                    srcPath,
                    // use .exe as python is already used in the directory
                    join(settingsTargetDirectory, "python.exe"),
                    "file"
                  );
                  symlinkSync(
                    srcPath,
                    // use .exe as python is already used in the directory
                    join(settingsTargetDirectory, "python3.exe"),
                    "file"
                  );
                } catch {
                  resolve(undefined);
                }

                resolve(`${settingsTargetDirectory}/python.exe`);
              } else {
                resolve(undefined);
              }
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
