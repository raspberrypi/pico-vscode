import { window } from "vscode";
import which from "which";
import type Settings from "../settings";
import { SettingsKey, HOME_VAR } from "../settings";
import { homedir } from "os";
import { downloadGit } from "./downloadGit";
import Logger, { LoggerSource } from "../logger";

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

/**
 * Checks if a git executable is avialable or try to install if possible.
 *
 * @returns True if git is available, false otherwise.
 */
export async function checkForGit(settings: Settings): Promise<boolean> {
  const gitExe: string =
    settings
      .getString(SettingsKey.gitPath)
      ?.replace(HOME_VAR, homedir().replaceAll("\\", "/")) || "git";

  const git: string | null = await which(gitExe, { nothrow: true });

  let isGitInstalled = git !== null;
  if (!isGitInstalled) {
    // try to install
    const gitDownloaded: string | undefined = await downloadGit();

    if (gitDownloaded !== undefined) {
      // if git is downloaded set custom git path
      await settings.updateGlobal(SettingsKey.gitPath, gitDownloaded);
      isGitInstalled = true;
    } else {
      Logger.error(
        LoggerSource.requirements,
        "Git is not installed and could not be downloaded."
      );
      void window.showErrorMessage(
        "The installation of the Pico SDK requires Git " +
          "to be installed and available in the PATH." +
          (process.platform === "darwin"
            ? " You can install it by running `xcode-select --install`" +
              " in the terminal and restart your computer."
            : "")
      );
    }
  }

  return isGitInstalled;
}
