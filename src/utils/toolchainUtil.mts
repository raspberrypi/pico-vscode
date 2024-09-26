import { get } from "https";
import * as ini from "ini";
import { homedir } from "os";
import { join } from "path";
import Logger from "../logger.mjs";
import { readdirSync, statSync, readFileSync } from "fs";
import { getDataRoot } from "./downloadHelpers.mjs";
import { isInternetConnected } from "./downloadHelpers.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

const iniUrl =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/supportedToolchains.ini`;
const supportedDistros = [
  "win32_x64",
  "darwin_arm64",
  "darwin_x64",
  "linux_x64",
  "linux_arm64",
];

export interface SupportedToolchainVersion {
  version: string;
  /// { [key in (typeof supportedDistros)[number]]?: string }
  downloadUrls: { [key: string]: string };
}

export interface InstalledToolchain {
  version: string;
  path: string;
}

function parseIni(data: string): SupportedToolchainVersion[] {
  const parsedIni: { [key: string]: { [key: string]: string } } =
    ini.parse(data);
  const supportedToolchains: SupportedToolchainVersion[] = [];

  // Iterate through sections
  for (const version in parsedIni) {
    const section: { [key: string]: string } = parsedIni[version];

    const downloadUrls: {
      [key in (typeof supportedDistros)[number]]: string;
    } = {};

    // Create an object with supported distros and their URLs
    for (const distro of supportedDistros) {
      if (section[distro]) {
        downloadUrls[distro] = section[distro];
      }
    }

    // Add the version and downloadUrls to the result array
    supportedToolchains.push({ version, downloadUrls });
  }

  return supportedToolchains;
}

export async function getSupportedToolchains(): Promise<
  SupportedToolchainVersion[]
> {
  try {
    if (!(await isInternetConnected())) {
      throw new Error(
        "Error while downloading supported toolchains list. " +
          "No internet connection"
      );
    }
    const result = await new Promise<SupportedToolchainVersion[]>(
      (resolve, reject) => {
        // Download the INI file
        get(iniUrl, response => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                "Error while downloading supported toolchains list. " +
                  `Status code: ${response.statusCode}`
              )
            );
          }
          let data = "";

          // Append data as it arrives
          response.on("data", chunk => {
            data += chunk;
          });

          // Parse the INI data when the download is complete
          response.on("end", () => {
            // Resolve with the array of SupportedToolchainVersion
            resolve(parseIni(data));
          });

          // Handle errors
          response.on("error", error => {
            reject(error);
          });
        });
      }
    );

    return result;
  } catch (error) {
    Logger.log(
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error"
    );

    try {
      // try to load local supported toolchains list
      const supportedToolchains = parseIni(
        readFileSync(join(getDataRoot(), "supportedToolchains.ini")).toString(
          "utf-8"
        )
      );

      return supportedToolchains;
    } catch {
      Logger.log("Error while loading local supported toolchains list.");

      return [];
    }
  }
}

export function detectInstalledToolchains(): InstalledToolchain[] {
  // detect installed toolchains by foldernames in $HOME/.pico-sdk/toolchain/<version>
  const homeDirectory = homedir();
  const toolchainDirectory = join(homeDirectory, ".pico-sdk", "toolchain");

  try {
    // check if pico-sdk directory exists
    if (!statSync(toolchainDirectory).isDirectory()) {
      Logger.log("No installed toolchain found.");

      return [];
    }
  } catch {
    Logger.log("No installed toolchain found.");

    return [];
  }

  // scan foldernames in picoSDKDirectory/toolchain
  const installedToolchains: InstalledToolchain[] = [];
  try {
    const versions = readdirSync(toolchainDirectory);
    // TODO: better regex or alternative
    for (const version of versions.filter(
      version =>
        /^\d+_\d+_(?:\w+(?:-|\.))?(\d+)$/.test(version) &&
        statSync(`${toolchainDirectory}/${version}`).isDirectory()
    )) {
      const toolchainPath = join(toolchainDirectory, version);

      installedToolchains.push({ version, path: toolchainPath });
    }
  } catch {
    Logger.log("Error while detecting installed Toolchains.");
  }

  return installedToolchains;
}
