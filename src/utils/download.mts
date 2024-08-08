import {
  createWriteStream, existsSync, readdirSync, symlinkSync, unlinkSync
} from "fs";
import { mkdir } from "fs/promises";
import { homedir, tmpdir } from "os";
import { basename, dirname, join } from "path";
import { join as joinPosix } from "path/posix";
import Logger from "../logger.mjs";
import { get, type RequestOptions } from "https";
import type { SupportedToolchainVersion } from "./toolchainUtil.mjs";
import { cloneRepository, initSubmodules, getGit } from "./gitUtil.mjs";
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
  getAuthorizationHeaders,
  EXT_USER_AGENT,
  GITHUB_API_BASE_URL,
  ownerOfRepository,
  repoNameOfRepository,
} from "./githubREST.mjs";
import { unxzFile, unzipFile } from "./downloadHelpers.mjs";

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
  "1.5.1": "v1.5.1-1",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "2.0.0": "v2.0.0-0",
};

/// Release tags for picotool
const PICOTOOL_RELEASES: { [key: string]: string } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "2.0.0": "v2.0.0-0",
};

/// Release tags for openocd
const OPENOCD_RELEASES: { [key: string]: string } = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "0.12.0+dev": "v2.0.0-0",
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

export function buildPicotoolPath(version: string): string {
  return joinPosix(
    homedir().replaceAll("\\", "/"),
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

export async function downloadAndInstallZip(
  url: string,
  targetDirectory: string,
  archiveFileName: string,
  logName: string,
  extraCallback?: () => void,
): Promise<boolean> {

  // Check if the SDK is already installed
  if (
    existsSync(targetDirectory)
    && readdirSync(targetDirectory).length !== 0
  ) {
    Logger.log(`${logName} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  await mkdir(targetDirectory, { recursive: true });

  const downloadUrl = url;
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
  const archiveFilePath = join(tmpBasePath, archiveFileName);

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
          `Error while downloading ${logName}: ` + response.statusMessage
        );

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadAndInstallZip(
            response.headers.location,
            targetDirectory, archiveFileName, logName, extraCallback
          )
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

              if (extraCallback !== undefined) {
                extraCallback();
              }

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

          if (extraCallback !== undefined) {
            extraCallback();
          }

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
      Logger.log(`Error while downloading ${logName}.`);

      return false;
    });
  });
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

  // TODO: this does take about 2s - may be reduced
  const requirementsCheck = await checkForInstallationRequirements(
    settings
  );
  if (!requirementsCheck) {
    return false;
  }

  const targetDirectory = buildSDKPath(version);

  // Check if the SDK is already installed
  if (
    existsSync(targetDirectory)
    && readdirSync(targetDirectory).length !== 0
  ) {
    Logger.log(`SDK ${version} is already installed.`);

    return true;
  }

  // Ensure the target directory exists
  //await mkdir(targetDirectory, { recursive: true });
  const gitPath = await getGit(settings);
  // using deferred execution to avoid git clone if git is not available
  if (
    gitPath !== undefined &&
    (await cloneRepository(
      repositoryUrl,
      version,
      targetDirectory,
      gitPath
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

    return initSubmodules(targetDirectory, gitPath);
  }

  return false;
}

async function downloadAndInstallGithubAsset(
  version: string,
  releaseVersion: string,
  repo: GithubRepository,
  targetDirectory: string,
  archiveFileName: string,
  assetName: string,
  logName: string,
  extraCallback?: () => void,

  redirectURL?: string,
): Promise<boolean> {
  // Check if the asset is already installed
  if (
    redirectURL === undefined
    && existsSync(targetDirectory)
    && readdirSync(targetDirectory).length !== 0
  ) {
    Logger.log(`${logName} ${version} is already installed.`);

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
      const release = await getGithubReleaseByTag(
        repo,
        releaseVersion
      );
      if (release === undefined) {
        return false;
      }

      // Find the asset
      Logger.log(release.assetsUrl);
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
    Logger.log(
      `Error fetching ${logName} release ${version}. ${
        error instanceof Error ? error.message : (error as string)
      }`
    );

    return false;
  }

  if (!asset) {
    Logger.log(
      `Error release asset for ${logName} release ${version} not found.`
    );

    return false;
  }

  let url = asset.browser_download_url;
  let options: RequestOptions = {};

  const githubPAT = Settings.getInstance()?.getString(SettingsKey.githubToken);

  if (redirectURL !== undefined) {
    Logger.log(`Downloading after redirect: ${redirectURL}`);
  } else if (githubPAT && githubPAT.length > 0) {
    // Use GitHub API to download the asset (will return a redirect)
    Logger.log(`Using GitHub API for download`);
    const assetID = asset.id;

    const headers: { [key: string]: string } = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "Accept": "application/octet-stream",
    };
    const owner = ownerOfRepository(repo);
    const repository = repoNameOfRepository(repo);
    url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repository}/` +
      `releases/assets/${assetID}`;
    const urlObj = new URL(url);
    options = {
      method: "GET",
      headers: {
        ...getAuthorizationHeaders(),
        ...headers,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
      },
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      minVersion: "TLSv1.2",
      protocol: urlObj.protocol,
    };
  }

  return new Promise(resolve => {
    // Use https.get to download the asset
    get(url, options, response => {
      const code = response.statusCode ?? 404;

      // redirects not supported
      if (code >= 400) {
        //return reject(new Error(response.statusMessage));
        Logger.log(`Error downloading ${logName}: ` + response.statusMessage);

        return resolve(false);
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
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
            response.headers.location
          )
        );
      }

      const fileWriter = createWriteStream(archiveFilePath).on("finish", () => {
        // unpack the archive
        if (archiveFileName.endsWith("tar.gz")) {
          unxzFile(archiveFilePath, targetDirectory)
            .then(success => {
              // delete tmp file
              unlinkSync(archiveFilePath);

              if (extraCallback !== undefined) {
                extraCallback();
              }

              resolve(success);
            })
            .catch(() => {
              unlinkSync(archiveFilePath);
              unlinkSync(targetDirectory);
              resolve(false);
            });
        } else if (archiveFileName.endsWith("zip")) {
          const success = unzipFile(archiveFilePath, targetDirectory);
          // delete tmp file
          unlinkSync(archiveFilePath);

          if (extraCallback !== undefined) {
            extraCallback();
          }

          if (!success) {
            unlinkSync(targetDirectory);
          }
          resolve(success);
        } else {
          unlinkSync(archiveFilePath);
          unlinkSync(targetDirectory);
          Logger.log(`Error: unknown archive extension: ${archiveFileName}`);
          resolve(false);
        }
      });
      response.pipe(fileWriter);
    }).on("error", error => {
      Logger.log(`Error downloading ${logName} asset:` + error.message);
      resolve(false);
    });
  });
}

export async function downloadAndInstallTools(
  version: string
): Promise<boolean> {
  const assetExt: string = process.platform === "linux" ? "tar.gz" : "zip";
  const targetDirectory = buildToolsPath(version);
  const archiveFileName = `sdk-tools.${assetExt}`;
  const assetName = `pico-sdk-tools-${version}${
    process.platform === "linux"
      ? process.arch === "arm64"
        ? "-aarch64"
        : "-x86_64"
      : ""
  }-${
    TOOLS_PLATFORMS[process.platform]
  }.${assetExt}`;

  return downloadAndInstallGithubAsset(
    version, TOOLS_RELEASES[version], 
    GithubRepository.tools,
    targetDirectory, archiveFileName, assetName,
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
  }-${
    TOOLS_PLATFORMS[process.platform]
  }.${assetExt}`;

  return downloadAndInstallGithubAsset(
    version, PICOTOOL_RELEASES[version], 
    GithubRepository.tools,
    targetDirectory, archiveFileName, assetName,
    "Picotool"
  );
}

export async function downloadAndInstallToolchain(
  toolchain: SupportedToolchainVersion,
  redirectURL?: string
): Promise<boolean> {
  const targetDirectory = buildToolchainPath(toolchain.version);

  // Check if the SDK is already installed
  if (
    redirectURL === undefined
    && existsSync(targetDirectory)
    && readdirSync(targetDirectory).length !== 0
  ) {
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
  version: string
): Promise<boolean> {
  /*if (process.platform === "linux") {
    Logger.log("Ninja installation on Linux is not supported.");

    return false;
  }*/

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
    version, version, 
    GithubRepository.ninja,
    targetDirectory, archiveFileName, assetName,
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
    Logger.log("OpenOCD installation not supported on this platform.");

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
        ? "-arm64" : ""
  }-${
    TOOLS_PLATFORMS[process.platform]
  }.${assetExt}`;

  const extraCallback = (): void => {
    // on darwin and linux platforms create windows compatible alias
    // so confiuration works on all platforms
    symlinkSync(
      join(targetDirectory, "openocd"),
      join(targetDirectory, "openocd.exe"),
      "file"
    );
  };

  return downloadAndInstallGithubAsset(
    version, OPENOCD_RELEASES[version], 
    GithubRepository.tools,
    targetDirectory, archiveFileName, assetName,
    "OpenOCD", extraCallback
  );
}

/**
 * Supports Windows and macOS amd64 and arm64.
 *
 * @param version
 * @returns
 */
export async function downloadAndInstallCmake(
  version: string
): Promise<boolean> {
  /*if (process.platform === "linux") {
    Logger.log("CMake installation on Linux is not supported.");

    return false;
  }*/

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
  };

  return downloadAndInstallGithubAsset(
    version, version, 
    GithubRepository.cmake,
    targetDirectory, archiveFileName, assetName,
    "CMake", extraCallback
  );
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
  if (
    redirectURL === undefined
    && existsSync(targetDirectory)
    && readdirSync(targetDirectory).length !== 0
  ) {
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
