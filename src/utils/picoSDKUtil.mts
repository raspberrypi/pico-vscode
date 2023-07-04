import { dirname, join } from "path";
import Logger from "../logger.mjs";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import which from "which";
import { getSystemPicoSDKPath } from "./picoSDKEnvUtil.mjs";
import { EnumRegKeyKeys, GetStringRegKey } from "vscode-windows-registry";

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
  } else if (process.platform === "darwin") {
    // TODO: implement
    return [
      {
        version: "1.5.1",
        sdkPath: "/Users/paulober/pico-sdk",
        toolchainPath:
          "/Applications/ArmGNUToolchain/12.2.mpacbti-rel1" +
          "/arm-none-eabi/bin",
      } as PicoSDK,
    ];
  } else {
    Logger.log(
      "Auto pico-sdk detection isn't currently supported on this platform."
    );

    return [];
  }
}

function detectInstalledSDKsWindows(): PicoSDK[] {
  try {
    const sdks = EnumRegKeyKeys(
      "HKEY_LOCAL_MACHINE",
      "\\SOFTWARE\\WOW6432Node\\Raspberry Pi"
    );

    return sdks
      .map(sdk => {
        const installDir = GetStringRegKey(
          "HKEY_LOCAL_MACHINE",
          "\\SOFTWARE\\WOW6432Node\\Raspberry Pi\\" + sdk,
          "InstallDir"
        );

        if (!installDir) {
          return undefined;
        }

        return {
          version: sdk.split(" ").pop()?.replace("v", ""),
          sdkPath: join(installDir, "pico-sdk"),
          toolchainPath: join(installDir, "gcc-arm-none-eabi", "bin"),
        } as PicoSDK;
      })
      .filter(sdk => sdk !== undefined) as PicoSDK[];
  } catch (error) {
    return [];
  }
}
