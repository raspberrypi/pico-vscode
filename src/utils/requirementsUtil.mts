import { window } from "vscode";
import which from "which";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";

/**
 * Checks if all requirements are met (to run the Pico Project Generator and cmake generator)
 *
 * @returns true if all requirements are met, false otherwise
 */
export async function checkForRequirements(
  settings: Settings
): Promise<boolean> {
  const ninjaExe: string = settings.getString(SettingsKey.ninjaPath) || "ninja";
  const cmakeExe: string = settings.getString(SettingsKey.cmakePath) || "cmake";
  const python3Exe: string =
    settings.getString(SettingsKey.python3Path) || process.platform === "win32"
      ? "python"
      : "python3";

  const ninja: string | null = await which(ninjaExe, { nothrow: true });
  const cmake: string | null = await which(cmakeExe, { nothrow: true });
  const python3: string | null = await which(python3Exe, { nothrow: true });

  // TODO: check python version
  return ninja !== null && cmake !== null && python3 !== null;
}

export async function showRquirementsNotMetErrorMessage(): Promise<void> {
  await window.showErrorMessage(
    "Development for the Pico (W) requires Ninja, CMake and Python 3 " +
      "to be installed and available in the PATH. " +
      "Please install and restart VS Code."
  );
}
