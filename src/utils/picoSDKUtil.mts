import { dirname, join } from "path";
import Logger from "../logger.mjs";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import which from "which";
import { getSystemPicoSDKPath } from "./picoSDKEnvUtil.mjs";
import { EnumRegKeyKeys, GetStringRegKey } from "vscode-windows-registry";
import UnixSDKManager from "./picoSDKUnixUtil.mjs";
import { window } from "vscode";
import { downloadAndInstallPicoSDKWindows } from "./installSDKUtil.mjs";

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

  /*get label(): string {
    return `Pico SDK v${this.version}`;
  }*/

  /*get description(): string {
    return this.sdkPath;
  }*/
}

let uninstallerPicoSDKs: PicoSDK[] = [];

/**
 * Returns selected sdk or undefined if not found
 *
 * @param settings Workspace settings
 * @returns [Pcio SDK path, toolchain path]
 */
export async function getSDKAndToolchainPath(
  settings: Settings
): Promise<[string, string] | undefined> {
  let sdkPath: string | undefined;
  let toolchainPath: string | undefined;

  const sdks = detectInstalledSDKs();

  const manualPicoSDKPath = settings.getString(SettingsKey.picoSDKPath);
  const manualToolchainPath = settings.getString(SettingsKey.toolchainPath);
  const sdkVersion = settings.getString(SettingsKey.picoSDK);

  if (sdkVersion) {
    const sdk = sdks.find(
      sdk => sdk.version.replace("v", "") === sdkVersion.replace("v", "")
    );

    if (!sdk) {
      Logger.log(`Pico SDK v${sdkVersion} not found.`);
      if (process.platform === "win32") {
        const choice = await window.showErrorMessage(
          `Pico SDK v${sdkVersion} not found. Do you want to install it?`,
          "Install"
        );

        if (choice === "Install") {
          // download file
          const result = await downloadAndInstallPicoSDKWindows(sdkVersion);
          if (result) {
            void window.showErrorMessage(
              "Successfully installed Pico SDK. " +
                "Please restart VSCode to apply changes."
            );
          } else {
            void window.showErrorMessage(
              "Download or Installation failed. See logs for more details."
            );
          }
        }
      }

      return undefined;
    } else {
      sdkPath = sdk.sdkPath;
      toolchainPath = sdk.toolchainPath;
    }
  }

  // use manual paths if set
  if (manualPicoSDKPath !== undefined && manualPicoSDKPath !== "") {
    sdkPath = manualPicoSDKPath;
  }
  if (manualToolchainPath !== undefined && manualToolchainPath !== "") {
    toolchainPath = manualToolchainPath;
  }

  return sdkPath && toolchainPath ? [sdkPath, toolchainPath] : undefined;
  /*? [sdkPath, toolchainPath]
    : // TODO: maybe remove this as its also not supported
      // to create new project with sdk and toolchain from env
      detectSDKAndToolchainFromEnv();*/
}

/**
 * Returns SDK and toolchain path from environment variables or undefined if not found
 *
 * @returns [Pcio SDK path, toolchain path]
 */
async function detectSDKAndToolchainFromEnv(): Promise<
  [string, string] | undefined
> {
  const PICO_SDK_PATH = getSystemPicoSDKPath();
  if (PICO_SDK_PATH) {
    // TODO: move compiler name into variable (global)
    // TODO: maybe also check PICO_TOOLCHAIN_PATH variable
    const toolchainPath: string | null = await which("arm-none-eabi-gcc", {
      nothrow: true,
    });

    if (toolchainPath !== null) {
      // get grandparent directory of compiler
      return [PICO_SDK_PATH, dirname(toolchainPath)];
    } else {
      if (
        process.env.PICO_TOOLCHAIN_PATH &&
        process.env.PICO_TOOLCHAIN_PATH !== ""
      ) {
        return [PICO_SDK_PATH, process.env.PICO_TOOLCHAIN_PATH];
      }
    }
  }

  return undefined;
}

export function detectInstalledSDKs(): PicoSDK[] {
  if (process.platform === "win32") {
    return detectInstalledSDKsWindows();
  } else if (process.platform === "darwin" || process.platform === "linux") {
    const config = UnixSDKManager.loadConfig();

    return config
      ? Object.entries(config.sdks).map(
          ([version, { picoSDKPath, toolchainPath }]) => ({
            version: version.replace("v", ""),
            sdkPath: picoSDKPath,
            toolchainPath,
          })
        )
      : [];
  } else {
    Logger.log(
      "Automatic pico-sdk detection isn't supported on " +
        "this platform use settings to specifc custom paths."
    );

    return [];
  }
}

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

// needs admin access
/*
export function fixRegistryKeys(): void {
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
            // needs admin access
            SetStringRegKey(
              "HKEY_LOCAL_MACHINE",
              "SOFTWARE\\WOW6432Node\\Raspberry Pi\\" +
                element.split(" ").slice(2).join(" "),
              "InstallPath",
              installPath
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
*/

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

    // done above
    /*uninstallerPicoSDKs
      .filter(sdk => !locatedSDKs.find(sdk2 => sdk2.version === sdk.version))
      .forEach(sdk => locatedSDKs.push(sdk));*/
    const count = locatedSDKs.push(...uninstallerPicoSDKs);
    if (count !== uninstallerPicoSDKs.length) {
      Logger.log("Problems while adding uninstaller SDKs.");
    }

    return locatedSDKs;
  } catch (error) {
    return [];
  }
}
