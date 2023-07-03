import { window } from "vscode";
import which from "which";

/**
 * Checks if all requirements are met (to run the Pico Project Generator and cmake generator)
 *
 * @returns true if all requirements are met, false otherwise
 */
export async function checkForRequirements(): Promise<boolean> {
  const ninja: string | null = await which("ninja", { nothrow: true });
  const cmake: string | null = await which("cmake", { nothrow: true });
  const python3: string | null = await which(
    process.platform === "win32" ? "python" : "python3",
    { nothrow: true }
  );

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
