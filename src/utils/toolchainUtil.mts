import { get } from "https";
import * as ini from "ini";
import { homedir } from "os";
import { join } from "path";
import Logger from "../logger.mjs";
import { readdirSync, statSync } from "fs";

// github blocks this
//const iniUrl =
//  "https://raw.githubusercontent.com/paulober
// /vscode-raspberry-pi-pico/main/supportedToolchains.ini";
const iniUrl =
  "https://vscode-raspberry-pi-pico.pages.dev/supportedToolchains.ini";
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

export async function getSupportedToolchains(): Promise<
  SupportedToolchainVersion[]
> {
  return new Promise<SupportedToolchainVersion[]>((resolve, reject) => {
    try {
      // Download the INI file
      get(iniUrl, response => {
        let data = "";

        // Append data as it arrives
        response.on("data", chunk => {
          data += chunk;
        });

        // Parse the INI data when the download is complete
        response.on("end", () => {
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

          // Resolve with the array of SupportedToolchainVersion
          resolve(supportedToolchains);
        });

        // Handle errors
        response.on("error", error => {
          reject(error);
        });
      });
    } catch (error) {
      Logger.log("Error while downloading supported toolchains list.");
      reject(error);
    }
  });
}

export interface InstalledToolchain {
  version: string;
  path: string;
}

export function detectInstalledToolchains(): InstalledToolchain[] {
  // detect installed sdks by foldernames in $HOME/.pico-sdk/<version>
  const homeDirectory = homedir();
  const picoSDKDirectory = join(homeDirectory, ".pico-sdk", "toolchain");

  try {
    // check if pico-sdk directory exists
    if (!statSync(picoSDKDirectory).isDirectory()) {
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
    const versions = readdirSync(picoSDKDirectory);
    // TODO: better regex or alternative
    for (const version of versions.filter(
      version =>
        /^\d+_\d+_(?:\w+(?:-|\.))?(\d+)$/.test(version) &&
        statSync(`${picoSDKDirectory}/${version}`).isDirectory()
    )) {
      const toolchainPath = join(picoSDKDirectory, version);

      installedToolchains.push({ version, path: toolchainPath });
    }
  } catch (error) {
    Logger.log("Error while detecting installed Toolchains.");
  }

  return installedToolchains;
}
