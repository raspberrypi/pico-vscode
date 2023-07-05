import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import Logger from "../logger.mjs";

export interface UnixConfig {
  sdks: { [version: string]: SDKPaths };
}

export interface SDKPaths {
  picoSDKPath: string;
  toolchainPath: string;
}

export default class UnixSDKManager {
  public static isValidVersion(version: string): boolean {
    const pattern = /^v\d+\.\d+\.\d+$/;

    return pattern.test(version);
  }

  public static saveConfig(config: UnixConfig): void {
    try {
      this.saveConfigToFile(config, UnixSDKManager.configFile());
    } catch (error) {
      Logger.log(`Failed to save unix sdks: ${(error as Error).message}`);
    }
  }

  private static saveConfigToFile(config: UnixConfig, file: string): void {
    const jsonData = JSON.stringify(config, null, 2);
    writeFileSync(file, jsonData);
  }

  public static loadConfig(): UnixConfig | undefined {
    try {
      return this.loadConfigFromFile(UnixSDKManager.configFile());
    } catch (error) {
      Logger.log(`Failed to load unix sdks: ${(error as Error).message}`);

      return undefined;
    }
  }

  private static loadConfigFromFile(file: string): UnixConfig | undefined {
    try {
      const jsonData = readFileSync(file, "utf8");

      return JSON.parse(jsonData) as UnixConfig;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Returns path to config file depending on operating system.
   * (Supported: macOS, Linux)
   *
   * @returns Path to config file
   * @throws Config directory cannot be created
   */
  private static configFile(): string {
    if (process.platform === "darwin") {
      const appSupportDir = join(homedir(), "Library", "Application Support");
      const configDir = join(appSupportDir, "PicoSDK");
      if (!existsSync(configDir)) {
        try {
          mkdirSync(configDir, { recursive: true });
        } catch (error) {
          throw new Error(`Failed to create config directory`);
        }
      }

      return join(configDir, "sdks.json");
    } else if (process.platform === "linux") {
      const homeDir = homedir();
      if (!homeDir) {
        throw new Error("Unable to determine home directory");
      }
      const configDir = join(homeDir, ".config", "PicoSDK");

      return join(configDir, "sdks.json");
    } else {
      throw new Error("Unsupported operating system");
    }
  }
}
