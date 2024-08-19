import { readdirSync, statSync } from "fs";
import Logger from "../logger.mjs";
import { join } from "path";
import { homedir } from "os";

export interface InstalledNinja {
  version: string;
  path: string;
}

export function detectInstalledToolchains(): InstalledNinja[] {
  // detect installed ninja versions by foldernames in $HOME/.pico-sdk/ninja/<version>
  const homeDirectory = homedir();
  const ninjaDirectory = join(homeDirectory, ".pico-sdk", "ninja");

  try {
    // check if pico-sdk directory exists
    if (!statSync(ninjaDirectory).isDirectory()) {
      Logger.log("No installed ninja found.");

      return [];
    }
  } catch {
    Logger.log("No installed ninja found.");

    return [];
  }

  // scan foldernames in picoSDKDirectory/ninja
  const installedNinjas: InstalledNinja[] = [];
  try {
    const versions = readdirSync(ninjaDirectory);
    // TODO: better regex or alternative
    for (const version of versions.filter(
      version =>
        /^\d+_\d+_\d+$/.test(version) &&
        statSync(`${ninjaDirectory}/${version}`).isDirectory()
    )) {
      const toolchainPath = join(ninjaDirectory, version);

      installedNinjas.push({ version, path: toolchainPath });
    }
  } catch {
    Logger.log("Error while detecting installed Toolchains.");
  }

  return installedNinjas;
}
