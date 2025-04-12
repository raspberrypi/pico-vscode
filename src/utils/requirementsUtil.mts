import { window } from "vscode";

/**
 * Shows an error message that the requirements for development are not met
 * and lists the missing requirements.
 *
 * @param missing The missing requirements.
 */
export async function showRequirementsNotMetErrorMessage(
  missing: string[]
): Promise<void> {
  await window.showErrorMessage(
    "Development for the Pico requires " +
      missing.join(", ") +
      " to be installed and available in PATH. " +
      "Please install and restart VS Code."
  );
}
