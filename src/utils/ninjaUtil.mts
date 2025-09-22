import { readdirSync, statSync } from "fs";
import Logger from "../logger.mjs";
import { join } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import which from "which";

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

/**
 * Get the version string of a ninja executable.
 * Works for both stable releases (e.g. "1.12.1")
 * and old releases like "release-<version>".
 *
 * @param ninjaPath Path to the ninja executable (absolute or in PATH).
 * @returns Promise that resolves to the version string (e.g. "1.12.1" or "release-120715"),
 *          or undefined if not found/parse failed.
 */
export async function getNinjaVersion(
  ninjaPath: string
): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(ninjaPath, ["--version"], { windowsHide: true }, (err, stdout) => {
      if (err) {
        console.error(`Failed to run ninja at ${ninjaPath}: ${err.message}`);
        resolve(undefined);

        return;
      }

      const firstLine = stdout.split(/\r?\n/)[0].trim().toLowerCase();
      // Expected: "1.12.1" or "release-120715"
      if (
        firstLine.length > 0 &&
        (firstLine.includes(".") || firstLine.startsWith("release-"))
      ) {
        resolve(firstLine);
      } else {
        console.error(`Unexpected ninja --version output: ${stdout}`);
        resolve(undefined);
      }
    });
  });
}

export async function getSystemNinjaVersion(): Promise<string | undefined> {
  const ninjaPath = await which("ninja", { nothrow: true });
  if (!ninjaPath) {
    return undefined;
  }

  return getNinjaVersion(ninjaPath);
}
