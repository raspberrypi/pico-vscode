import { dirname, join } from "path";
import Logger from "../logger.mjs";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import which from "which";
import { getSystemPicoSDKPath } from "./picoSDKEnvUtil.mjs";
import { EnumRegKeyKeys, GetStringRegKey } from "vscode-windows-registry";
import UnixSDKManager, { UnixConfig } from "./picoSDKUnixUtil.mjs";

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
    const sdk = sdks.find(sdk => sdk.version === sdkVersion);

    if (!sdk) {
      Logger.log(`Pico SDK v${sdkVersion} not found.`);

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

  return sdkPath && toolchainPath
    ? [sdkPath, toolchainPath]
    : detectSDKAndToolchainFromEnv();
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

function detectInstalledSDKsWindows(): PicoSDK[] {
  try {
    const sdks = EnumRegKeyKeys(
      "HKEY_LOCAL_MACHINE",
      "SOFTWARE\\WOW6432Node\\Raspberry Pi"
    );

    return sdks
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

        return {
          version: version,
          sdkPath: join(installDir, "pico-sdk"),
          toolchainPath: join(installDir, "gcc-arm-none-eabi", "bin"),
        } as PicoSDK;
      })
      .filter(sdk => sdk !== undefined) as PicoSDK[];
  } catch (error) {
    return [];
  }
}
