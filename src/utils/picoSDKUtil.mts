import { join } from "path";
import Logger from "../logger.mjs";
//import { EnumRegKeyKeys, GetStringRegKey } from "vscode-windows-registry";
import { homedir } from "os";
import { readdirSync, statSync } from "fs";

// implements QuickPickItem does not work somehow
export class PicoSDK {
  public version: string;
  public sdkPath: string;
  public toolchainPath: string;

  constructor(version: string, sdkPath: string, toolchainPath: string) {
    this.version = version;
    this.sdkPath = sdkPath;
    this.toolchainPath = toolchainPath;
  }
}

export interface InstalledSDK {
  version: string;
  sdkPath: string;
}

export function detectInstalledSDKs(): InstalledSDK[] {
  // detect installed sdks by foldernames in $HOME/.pico-sdk/sdk/<version>
  const homeDirectory = homedir();
  const picoSDKDirectory = join(homeDirectory, ".pico-sdk", "sdk");

  try {
    // check if pico-sdk directory exists
    if (!statSync(picoSDKDirectory).isDirectory()) {
      return [];
    }
  } catch {
    Logger.log("No installed sdk found.");

    return [];
  }

  // scan foldernames in picoSDKDirectory/sdk
  const installedSDKs: InstalledSDK[] = [];
  try {
    const versions = readdirSync(picoSDKDirectory);
    for (const version of versions.filter(
      version =>
        /^\d+\.\d+\.\d+$/.test(version) &&
        statSync(`${picoSDKDirectory}/${version}`).isDirectory()
    )) {
      const sdkPath = join(picoSDKDirectory, version);

      installedSDKs.push({ version, sdkPath });
    }
  } catch {
    Logger.log("Error while detecting installed SDKs.");
  }

  return installedSDKs;
}

/*
let uninstallerPicoSDKs: PicoSDK[] = [];

export function queryInstalledSDKsFromUninstallers(): void {
  try {
    const uninstallers = EnumRegKeyKeys(
      "HKEY_LOCAL_MACHINE",
      "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
    );

    uninstallers.forEach(element => {
      if (element.startsWith("Raspberry Pi Pico SDK")) {
        try {
          const installPath = GetStringRegKey(
            "HKEY_LOCAL_MACHINE",
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" +
              element,
            "InstallPath"
          );

          if (installPath) {
            uninstallerPicoSDKs.push(
              new PicoSDK(
                element.split(" ").pop()?.replace("v", "") ?? "0.0.0",
                join(installPath, "pico-sdk"),
                join(installPath, "gcc-arm-none-eabi", "bin")
              )
            );
          }
        } catch (error) {
          Logger.log("No InstallPath found for uninstaller: " + element);
        }
      }
    });
  } catch (error) {
    Logger.log("Error while fixing registry keys for Windows Pico SDK.");
  }
}

function detectInstalledSDKsWindows(): PicoSDK[] {
  try {
    const sdks = EnumRegKeyKeys(
      "HKEY_LOCAL_MACHINE",
      "SOFTWARE\\WOW6432Node\\Raspberry Pi"
    );

    const locatedSDKs = sdks
      .map(sdk => {
        const installDir = GetStringRegKey(
          "HKEY_LOCAL_MACHINE",
          "SOFTWARE\\WOW6432Node\\Raspberry Pi\\" + sdk,
          "InstallPath"
        );

        const version = sdk.split(" ").pop();
        if (!installDir || !version) {
          return undefined;
        }

        // avoid duplicates
        const finalVersion = version.replace("v", "");

        uninstallerPicoSDKs = uninstallerPicoSDKs.filter(
          sdk => sdk.version !== finalVersion
        );

        return {
          version: version.replace("v", ""),
          sdkPath: join(installDir, "pico-sdk"),
          toolchainPath: join(installDir, "gcc-arm-none-eabi", "bin"),
        } as PicoSDK;
      })
      .filter(sdk => sdk !== undefined) as PicoSDK[];

    const count = locatedSDKs.push(...uninstallerPicoSDKs);
    if (count !== uninstallerPicoSDKs.length) {
      Logger.log("Problems while adding uninstaller SDKs.");
    }

    return locatedSDKs;
  } catch (error) {
    return uninstallerPicoSDKs;
  }
}
*/
