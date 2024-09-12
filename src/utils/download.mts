import {
  copyFileSync,
  createWriteStream,
  existsSync,
  readdirSync,
  symlinkSync,
  rmSync,
} from "fs";
import { mkdir } from "fs/promises";
import { homedir, tmpdir } from "os";
import { basename, dirname, join } from "path";
import { join as joinPosix } from "path/posix";
import Logger, { LoggerSource } from "../logger.mjs";
import { STATUS_CODES } from "http";
import type { Dispatcher } from "undici";
import { Client } from "undici";
import type { SupportedToolchainVersion } from "./toolchainUtil.mjs";
import { cloneRepository, initSubmodules, getGit } from "./gitUtil.mjs";
import { checkForGit } from "./requirementsUtil.mjs";
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
  getAuthorizationHeaders,
  EXT_USER_AGENT,
  GITHUB_API_BASE_URL,
  ownerOfRepository,
  repoNameOfRepository,
  GITHUB_API_VERSION,
  HTTP_STATUS_UNAUTHORIZED,
  githubApiUnauthorized,
  HTTP_STATUS_FORBIDDEN,
} from "./githubREST.mjs";
import { unxzFile, unzipFile } from "./downloadHelpers.mjs";
import type { Writable } from "stream";
import { unknownErrorToString } from "./errorHelper.mjs";

/// Translate nodejs platform names to ninja platform names
const NINJA_PLATFORMS: { [key: string]: string } = {
  darwin: "mac",
  linux: "linux",
  win32: "win",
};

/// Translate nodejs platform names to pico-sdk-tools platform names
const TOOLS_PLATFORMS: { [key: string]: string } = {
  darwin: "mac",
  linux: "lin",
  win32: "x64-win",
};

/// Release tags for the sdk tools
const TOOLS_RELEASES: { [key: string]: string } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "1.5.1": "v1.5.1-0",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "2.0.0": "v2.0.0-3",
};

/// Release tags for picotool
const PICOTOOL_RELEASES: { [key: string]: string } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "2.0.0": "v2.0.0-3",
};

/// Release tags for openocd
const OPENOCD_RELEASES: { [key: string]: string } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "0.12.0+dev": "v2.0.0-3",
};

/// Translate nodejs platform names to cmake platform names
const CMAKE_PLATFORMS: { [key: string]: string } = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

// Compute and cache the home directory
const homeDirectory: string = homedir();

export function buildToolchainPath(version: string): string {
  return joinPosix(homeDirectory, ".pico-sdk", "toolchain", version);
}

export function buildSDKPath(version: string): string {
  // TODO: maybe replace . with _
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "sdk",
    version
  );
}

export function buildCMakeIncPath(absolute: boolean): string {
  // TODO: maybe replace . with _
  const relPath = joinPosix(".pico-sdk", "cmake");
  if (absolute) {
    return joinPosix(homeDirectory.replaceAll("\\", "/"), relPath);
  } else {
    return joinPosix("${USERHOME}", relPath);
  }
}

export function buildToolsPath(version: string): string {
  // TODO: maybe replace . with _
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "tools",
    version
  );
}

export function buildPicotoolPath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "picotool",
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
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "ninja",
    version
  );
}

export function buildOpenOCDPath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "openocd",
    version
  );
}

export function buildCMakePath(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "cmake",
    version
  );
}

export function buildPython3Path(version: string): string {
  return joinPosix(
    homeDirectory.replaceAll("\\", "/"),
    ".pico-sdk",
    "python",
    version
  );
}

export async function downloadAndInstallZip(
  url: string,
  targetDirectory: string,
  archiveFileName: string,
  logName: string,
  extraCallback?: () => void,
  redirectURL?: string
): Promise<boolean> {
  // Check if the SDK is already installed
  if (
    existsSync(targetDirectory) &&
    readdirSync(targetDirectory).length !== 0
  ) {
    Logger.info(LoggerSource.downloader, `${logName} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const basenameSplit = basename(url).split(".");
  let artifactExt = basenameSplit.pop();
  if (artifactExt === "xz" || artifactExt === "gz") {
    artifactExt = basenameSplit.pop() + "." + artifactExt;
  }

  if (artifactExt === undefined) {
    return false;
  }

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, archiveFileName);

  return new Promise(resolve => {
    const downloadUrl = new URL(redirectURL ?? url);
    const client = new Client(downloadUrl.origin);

    const requestOptions: Dispatcher.RequestOptions = {
      path: downloadUrl.pathname + downloadUrl.search,
      method: "GET",
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: "*/*",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Accept-Encoding": "gzip, deflate, br",
      },
      maxRedirections: 0,
    };

    // save requested stream to file
    client.stream(
      requestOptions,
      ({ statusCode, headers }) =>
        createWriteStream(archiveFilePath).on("finish", () => {
          const code = statusCode ?? 404;

          if (code >= 400) {
            //return reject(new Error(STATUS_CODES[code]));
            Logger.error(
              LoggerSource.downloader,
              `Downloading ${logName} failed: ` + STATUS_CODES[code]
            );

            return resolve(false);
          }

          // handle redirects
          if (code > 300 && !!headers.location) {
            return resolve(
              downloadAndInstallZip(
                url,
                targetDirectory,
                archiveFileName,
                logName,
                extraCallback,
                headers.location.toString()
              )
            );
          }

          // unpack the archive
          if (artifactExt === "tar.xz" || artifactExt === "tar.gz") {
            unxzFile(archiveFilePath, targetDirectory)
              .then(success => {
                // delete tmp file
                rmSync(archiveFilePath, { recursive: true, force: true });

                if (extraCallback !== undefined) {
                  extraCallback();
                }

                resolve(success);
              })
              .catch(() => {
                rmSync(archiveFilePath, { recursive: true, force: true });
                rmSync(targetDirectory, { recursive: true, force: true });
                resolve(false);
              });
          } else if (artifactExt === "zip") {
            const success = unzipFile(archiveFilePath, targetDirectory);
            // delete tmp file
            rmSync(archiveFilePath, { recursive: true, force: true });

            if (extraCallback !== undefined) {
              extraCallback();
            }

            if (!success) {
              rmSync(targetDirectory, { recursive: true, force: true });
            }
            resolve(success);
          } else {
            rmSync(archiveFilePath, { recursive: true, force: true });
            rmSync(targetDirectory, { recursive: true, force: true });
            Logger.error(
              LoggerSource.downloader,
              `Unknown archive extension: ${artifactExt}`
            );
            resolve(false);
          }
        }),
      error => {
        if (error) {
          // error - clean
          rmSync(archiveFilePath, { recursive: true, force: true });
          rmSync(targetDirectory, { recursive: true, force: true });
          Logger.error(
            LoggerSource.downloader,
            `Downloading ${logName} failed:`,
            error.message
          );

          resolve(false);
        }
      }
    );
  });
}

/**
 * Downloads and installs the Pico SDK.
 *
 * @param version The version of the SDK to download
 * @param repositoryUrl The URL of the repository to download the SDK from
 * @param python3Path The path to a Python3 executable
 * @returns A promise that resolves to true if the SDK was successfully
 * downloaded and installed, false otherwise
 */
export async function downloadAndInstallSDK(
  version: string,
  repositoryUrl: string,
  python3Path?: string
): Promise<boolean> {
  const settings = Settings.getInstance();
  if (settings === undefined) {
    Logger.error(LoggerSource.downloader, "Settings not initialized.");

    return false;
  }

  // TODO: this does take about 2s - may be reduced
  const requirementsCheck = await checkForGit(settings);
  if (!requirementsCheck) {
    return false;
  }

  // Install pico-vscode.cmake file - overwrite if it's already there
  await mkdir(buildCMakeIncPath(true), { recursive: true });
  copyFileSync(
    joinPosix(getScriptsRoot(), "pico-vscode.cmake"),
    joinPosix(buildCMakeIncPath(true), "pico-vscode.cmake")
  );

  const targetDirectory = buildSDKPath(version);

  // Check if the SDK is already installed
  if (
    existsSync(targetDirectory) &&
    readdirSync(targetDirectory).length !== 0
  ) {
    Logger.info(
      LoggerSource.downloader,
      `SDK ${version} is already installed.`
    );

    return true;
  }

  // Ensure the target directory exists
  //await mkdir(targetDirectory, { recursive: true });
  const gitPath = await getGit(settings);
  // using deferred execution to avoid git clone if git is not available
  if (
    gitPath !== undefined &&
    (await cloneRepository(repositoryUrl, version, targetDirectory, gitPath))
  ) {
    settings.reload();
    // check python requirements
    const python3Exe: string =
      python3Path ||
      settings
        .getString(SettingsKey.python3Path)
        ?.replace(HOME_VAR, homeDirectory.replaceAll("\\", "/")) ||
      (process.platform === "win32" ? "python" : "python3");
    const python3: string | null = await which(python3Exe, { nothrow: true });

    if (python3 === null) {
      Logger.error(
        LoggerSource.downloader,
        "Python3 is not installed and could not be downloaded."
      );

      void window.showErrorMessage("Python3 is not installed and in PATH.");

      return false;
    }

    return initSubmodules(targetDirectory, gitPath);
  }

  return false;
}

/**
 * Downloads and installs a GitHub release asset.
 *
 * @param version The version of the asset to download
 * @param releaseVersion The release tag of the asset to download
 * @param repo The repository to download the asset from
 * @param targetDirectory The directory to install the asset to
 * @param archiveFileName The name of the archive file to download
 * @param assetName The name of the asset to download
 * @param logName The name of the asset to log
 * @param extraCallback An optional callback to execute after the asset is installed
 * @param redirectURL An optional redirect URL to download the asset
 * from (used to follow redirects recursively)
 * @returns A promise that resolves to true if the asset was downloaded and installed successfully
 */
async function downloadAndInstallGithubAsset(
  version: string,
  releaseVersion: string,
  repo: GithubRepository,
  targetDirectory: string,
  archiveFileName: string,
  assetName: string,
  logName: string,
  extraCallback?: () => void,

  redirectURL?: string
): Promise<boolean> {
  // Check if the asset has already been installed
  if (
    redirectURL === undefined &&
    existsSync(targetDirectory) &&
    readdirSync(targetDirectory).length !== 0
  ) {
    Logger.debug(
      LoggerSource.downloader,
      `${logName} ${version} is already installed.`
    );

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(tmpBasePath, archiveFileName);

  let asset: GithubReleaseAssetData | undefined;

  try {
    if (redirectURL === undefined) {
      const release = await getGithubReleaseByTag(repo, releaseVersion);
      if (release === undefined) {
        return false;
      }

      // Find the asset to download
      asset = release.assets.find(asset => asset.name === assetName);
    } else {
      asset = {
        name: version,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        browser_download_url: redirectURL,
        id: -1,
      };
    }
  } catch (error) {
    Logger.error(
      LoggerSource.downloader,
      "Fetching ${logName} release ${version} failed:",
      unknownErrorToString(error)
    );

    return false;
  }

  if (!asset) {
    Logger.error(
      LoggerSource.downloader,
      `Release asset for ${logName} release ${version} not found.`
    );

    return false;
  }

  let url = asset.browser_download_url;
  let options: Dispatcher.RequestOptions;
  let client: Client;

  const githubPAT = Settings.getInstance()?.getString(SettingsKey.githubToken);

  if (redirectURL !== undefined) {
    Logger.debug(
      LoggerSource.downloader,
      `Downloading after redirect: ${redirectURL}`
    );
  }

  if (redirectURL === undefined && githubPAT && githubPAT.length > 0) {
    // Use GitHub API to download the asset (will return a redirect)
    Logger.debug(LoggerSource.downloader, "Using GitHub API for download");
    const assetID = asset.id;

    const headers: { [key: string]: string } = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Accept: "application/octet-stream",
    };
    const owner = ownerOfRepository(repo);
    const repository = repoNameOfRepository(repo);
    url =
      `${GITHUB_API_BASE_URL}/repos/${owner}/${repository}/` +
      `releases/assets/${assetID}`;
    const urlObj = new URL(url);
    client = new Client(urlObj.origin);
    options = {
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        ...getAuthorizationHeaders(),
        ...headers,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
      },
      maxRedirections: 0, // don't automatically follow redirects
    };
  } else {
    const urlObj = new URL(url);
    client = new Client(urlObj.origin);
    options = {
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
      },
      maxRedirections: 0, // don't automatically follow redirects
    };
  }
  // keep track of retries
  let retries = 0;

  return new Promise(resolve => {
    //, data: Dispatcher.StreamData)
    const clientErrorCallback = (error: Error | null): void => {
      if (error) {
        Logger.error(
          LoggerSource.downloader,
          `Downloading ${logName} asset failed:` + error.message
        );
        resolve(false);
      }
    };

    const clientFactoryCallback = ({
      statusCode,
      headers,
    }: Dispatcher.StreamFactoryData): Writable =>
      createWriteStream(archiveFilePath).on("finish", () => {
        const code = statusCode ?? 404;

        if (code >= 400) {
          if (code === HTTP_STATUS_UNAUTHORIZED) {
            retries++;
            if (retries > 2) {
              Logger.error(
                LoggerSource.downloader,
                `Downloading ${logName} failed. Multiple ` + STATUS_CODES[code]
              );
              resolve(false);

              return;
            }
            // githubApiUnauthorized will take care of removing the
            // token so it isn't used in retry attpemt
            githubApiUnauthorized()
              .then(() => {
                client.stream(
                  options,
                  clientFactoryCallback,
                  clientErrorCallback
                );
              })
              .catch(() => {
                resolve(false);
              });
          } else if (code === HTTP_STATUS_FORBIDDEN) {
            Logger.error(
              LoggerSource.downloader,
              `Downloading ${logName} failed: ` + STATUS_CODES[code]
            );
            resolve(false);
          }
          //return reject(new Error(STATUS_CODES[code]));
          Logger.error(
            LoggerSource.downloader,
            `Downloading ${logName} failed: ` + STATUS_CODES[code]
          );

          return resolve(false);
        }

        // handle redirects
        if (code > 300 && !!headers.location) {
          return resolve(
            downloadAndInstallGithubAsset(
              version,
              releaseVersion,
              repo,
              targetDirectory,
              archiveFileName,
              assetName,
              logName,
              extraCallback,
              headers.location.toString()
            )
          );
        }

        // unpack the archive
        if (archiveFileName.endsWith("tar.gz")) {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              // delete tmp file
              rmSync(archiveFilePath, { recursive: true, force: true });

              if (extraCallback !== undefined) {
                extraCallback();
              }

              resolve(success);
            })
            .catch(() => {
              rmSync(archiveFilePath, { recursive: true, force: true });
              rmSync(targetDirectory, { recursive: true, force: true });
              resolve(false);
            });
        } else if (archiveFileName.endsWith("zip")) {
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          rmSync(archiveFilePath, { recursive: true, force: true });

          if (extraCallback !== undefined) {
            extraCallback();
          }

          if (!success) {
            rmSync(targetDirectory, { recursive: true, force: true });
          }
          resolve(success);
        } else {
          rmSync(archiveFilePath, { recursive: true, force: true });
          rmSync(targetDirectory, { recursive: true, force: true });
          Logger.error(
            LoggerSource.downloader,
            `Unknown archive extension: ${archiveFileName}`
          );
          resolve(false);
        }
      });

    // Use client.stream to download the asset
    client.stream(options, clientFactoryCallback, clientErrorCallback);
  });
}

export async function downloadAndInstallTools(
  version: string
): Promise<boolean> {
  if (parseInt(version.split(".")[0]) < 2) {
    if (process.platform !== "win32") {
      Logger.debug(
        LoggerSource.downloader,
        `Skipping tools install on non Windows system for pre-2.0.0 SDK.`
      );

      return true;
    }
  }
  const assetExt: string = process.platform === "linux" ? "tar.gz" : "zip";
  const targetDirectory = buildToolsPath(version);
  const archiveFileName = `sdk-tools.${assetExt}`;
  const assetName = `pico-sdk-tools-${version}${
    process.platform === "linux"
      ? process.arch === "arm64"
        ? "-aarch64"
        : "-x86_64"
      : ""
  }-${TOOLS_PLATFORMS[process.platform]}.${assetExt}`;

  return downloadAndInstallGithubAsset(
    version,
    TOOLS_RELEASES[version],
    GithubRepository.tools,
    targetDirectory,
    archiveFileName,
    assetName,
    "SDK Tools"
  );
}

export async function downloadAndInstallPicotool(
  version: string
): Promise<boolean> {
  const assetExt: string = process.platform === "linux" ? "tar.gz" : "zip";
  const targetDirectory = buildPicotoolPath(version);
  const archiveFileName = `picotool.${assetExt}`;
  const assetName = `picotool-${version}${
    process.platform === "linux"
      ? process.arch === "arm64"
        ? "-aarch64"
        : "-x86_64"
      : ""
  }-${TOOLS_PLATFORMS[process.platform]}.${assetExt}`;

  return downloadAndInstallGithubAsset(
    version,
    PICOTOOL_RELEASES[version],
    GithubRepository.tools,
    targetDirectory,
    archiveFileName,
    assetName,
    "Picotool"
  );
}

export async function downloadAndInstallToolchain(
  toolchain: SupportedToolchainVersion
): Promise<boolean> {
  const targetDirectory = buildToolchainPath(toolchain.version);

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

  const archiveFileName = `${toolchain.version}.${artifactExt}`;

  return downloadAndInstallZip(
    downloadUrl,
    targetDirectory,
    archiveFileName,
    "Toolchain"
  );
}

/**
 * Download and install the Ninja build system.
 *
 * @param version The version of Ninja to download
 * @returns A promise that resolves to true if Ninja was
 * successfully downloaded and installed, false otherwise
 */
export async function downloadAndInstallNinja(
  version: string
): Promise<boolean> {
  const targetDirectory = buildNinjaPath(version);
  const archiveFileName = `ninja.zip`;
  const assetName = `ninja-${NINJA_PLATFORMS[process.platform]}${
    process.platform === "linux"
      ? process.arch === "arm64"
        ? "-aarch64"
        : ""
      : ""
  }.zip`;

  return downloadAndInstallGithubAsset(
    version,
    version,
    GithubRepository.ninja,
    targetDirectory,
    archiveFileName,
    assetName,
    "ninja"
  );
}

/// Detects if the current system is a Raspberry Pi with Debian
/// by reading /proc/cpuinfo and /etc/os-release
// async function isRaspberryPi(): Promise<boolean> {
//   try {
//     // TODO: imporove detection speed
//     const cpuInfo = await readFile("/proc/cpuinfo", "utf8");
//     const osRelease = await readFile("/etc/os-release", "utf8");
//     const versionId = osRelease.match(/VERSION_ID="?(\d+)"?/)?.[1] ?? "0";

//     return (
//       cpuInfo.toLowerCase().includes("raspberry pi") &&
//       osRelease.toLowerCase().includes(`name="debian gnu/linux"`) &&
//       parseInt(versionId) >= 12
//     );
//   } catch (error) {
//     // Handle file read error or other exceptions
//     Logger.log(
//       "Error reading /proc/cpuinfo or /etc/os-release:",
//       error instanceof Error ? error.message : (error as string)
//     );

//     return false;
//   }
// }

export async function downloadAndInstallOpenOCD(
  version: string
): Promise<boolean> {
  if (
    (process.platform === "darwin" && process.arch === "x64") ||
    (process.platform === "linux" && !["arm64", "x64"].includes(process.arch))
  ) {
    Logger.error(
      LoggerSource.downloader,
      "Installation of OpenOCD not supported on this platform."
    );

    return false;
  }
  const assetExt: string = process.platform === "linux" ? "tar.gz" : "zip";
  const targetDirectory = buildOpenOCDPath(version);
  const archiveFileName = `openocd.${assetExt}`;
  const assetName = `openocd-${version}${
    process.platform === "linux"
      ? process.arch === "arm64"
        ? "-aarch64"
        : "-x86_64"
      : process.platform === "darwin"
      ? "-arm64"
      : ""
  }-${TOOLS_PLATFORMS[process.platform]}.${assetExt}`;

  const extraCallback = (): void => {
    if (process.platform !== "win32") {
      // on darwin and linux platforms create windows compatible alias
      // so confiuration works on all platforms
      symlinkSync(
        join(targetDirectory, "openocd"),
        join(targetDirectory, "openocd.exe"),
        "file"
      );
    }
  };

  return downloadAndInstallGithubAsset(
    version,
    OPENOCD_RELEASES[version],
    GithubRepository.tools,
    targetDirectory,
    archiveFileName,
    assetName,
    "OpenOCD",
    extraCallback
  );
}

/**
 * Supports Windows and macOS and Linux.
 *
 * @param version
 * @returns
 */
export async function downloadAndInstallCmake(
  version: string
): Promise<boolean> {
  const targetDirectory = buildCMakePath(version);
  const assetExt = process.platform === "win32" ? "zip" : "tar.gz";
  const archiveFileName = `cmake-${version}.${assetExt}`;
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

  const extraCallback = (): void => {
    // on macOS the download includes an app bundle
    // create a symlink so it has the same path as on other platforms
    if (process.platform === "darwin") {
      symlinkSync(
        join(targetDirectory, "CMake.app", "Contents", "bin"),
        join(targetDirectory, "bin"),
        "dir"
      );
    }
    // macOS
    //chmodSync(join(targetDirectory, "CMake.app", "Contents", "bin", "cmake"), 0o755);
  };

  return downloadAndInstallGithubAsset(
    version,
    version,
    GithubRepository.cmake,
    targetDirectory,
    archiveFileName,
    assetName,
    "CMake",
    extraCallback
  );
}

/**
 * Downloads and installs Python3 Embed.
 *
 * Supports Windows x64.
 *
 * Even tough this function supports downloading python3 on
 * macOS arm64 it doesn't work correctly therefore it's
 * excluded here use pyenvInstallPython instead.
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
    Logger.error(
      LoggerSource.downloader,
      "Embed Python installation is only supported on Windows x64."
    );

    return;
  }

  const targetDirectory = buildPython3Path(versionBundle.python.version);
  const settingsTargetDirectory =
    `${HOME_VAR}/.pico-sdk` + `/python/${versionBundle.python.version}`;

  // Check if the Embed Python is already installed
  if (
    redirectURL === undefined &&
    existsSync(targetDirectory) &&
    readdirSync(targetDirectory).length !== 0
  ) {
    Logger.info(
      LoggerSource.downloader,
      `Embed Python is already installed correctly.`
    );

    return `${settingsTargetDirectory}/python.exe`;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  // select download url
  const downloadUrl = new URL(versionBundle.python.windowsAmd64);

  const tmpBasePath = join(tmpdir(), "pico-sdk");
  await mkdir(tmpBasePath, { recursive: true });
  const archiveFilePath = join(
    tmpBasePath,
    `python-${versionBundle.python.version}.zip`
  );

  return new Promise(resolve => {
    const client = new Client(downloadUrl.origin);

    const requestOptions: Dispatcher.RequestOptions = {
      path: downloadUrl.pathname + downloadUrl.search,
      method: "GET",
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: "*/*",
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Accept-Encoding": "gzip, deflate, br",
      },
      maxRedirections: 3,
    };

    // save requested stream to file
    client.stream(
      requestOptions,
      ({ statusCode }) =>
        createWriteStream(archiveFilePath).on("finish", () => {
          const code = statusCode ?? 404;

          if (code >= 400) {
            //return reject(new Error(STATUS_CODES[code]));
            Logger.error(
              LoggerSource.downloader,
              "Downloading embed Python3 failed:",
              STATUS_CODES[code] ?? `Unknown status code '${code}'`
            );

            return resolve(undefined);
          }

          // any redirects should have been handled by undici

          // doesn't work correctly therefore use pyenvInstallPython instead
          // TODO: maybe remove unused darwin code-path here
          if (process.platform === "darwin") {
            const pkgExtractor = new MacOSPythonPkgExtractor(
              archiveFilePath,
              targetDirectory
            );

            pkgExtractor
              .extractPkg()
              .then(success => {
                if (versionBundle.python.version.lastIndexOf(".") <= 2) {
                  Logger.error(
                    LoggerSource.downloader,
                    "Extracting Embed Python3 failed - " +
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
            rmSync(archiveFilePath, { recursive: true, force: true });
            resolve(
              success ? `${settingsTargetDirectory}/python.exe` : undefined
            );
          }
        }),
      err => {
        if (err) {
          Logger.error(
            LoggerSource.downloader,
            "Downloading Embed Python failed:",
            err.message
          );

          return false;
        }
      }
    );
  });
}
