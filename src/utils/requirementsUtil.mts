import { window } from "vscode";
import which from "which";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import { downloadGit } from "./downloadGit.mjs";
import Logger from "../logger.mjs";

export async function showRequirementsNotMetErrorMessage(
  missing: string[]
): Promise<void> {
  await window.showErrorMessage(
    "Development for the Pico (W) requires " +
      missing.join(", ") +
      " to be installed and available in the PATH. " +
      "Please install and restart VS Code."
  );
}

/**
 * Checks if all requirements for installing a Pico-SDK are met
 * TODO: add support for custom compiler and git paths in settings
 *
 * @returns true if all requirements are met, false otherwise
 */
export async function checkForInstallationRequirements(
  settings: Settings,
  gitPath?: string
): Promise<boolean> {
  const gitExe: string = gitPath || "git";
  const compilerExe: string[] = ["clang", "gcc", "cl"];

  const git: string | null = await which(gitExe, { nothrow: true });
  //check if any of the compilers is available
  const compiler: string | null = await Promise.any(
    compilerExe
      .map(compiler => which(compiler, { nothrow: true }))
      .map(p => p.catch(() => null))
  );
  // set availability of tools on windows
  const allToolsAvailable: boolean = process.platform === "win32";

  let requirementsMet: boolean = true;
  if (git === null) {
    if (process.platform === "linux") {
      requirementsMet = false;
    } else if (process.platform === "darwin") {
      void window.showErrorMessage(
        "Installation of the Pico-SDK requires Git to be installed " +
          "and in PATH. You can install it by running " +
          "`xcode-select --install` in the terminal and restart your computer."
      );
      requirementsMet = false;
    } else {
      // install if not available
      const gitDownloaded: string | undefined = await downloadGit();

      if (gitDownloaded === undefined) {
        Logger.log("Error: Git is not installed and could not be downloaded.");
        requirementsMet = false;
      } else {
        // if git is downloaded set custom git path
        await settings.updateGlobal(SettingsKey.gitPath, gitDownloaded);
      }
    }
  }
  if (!allToolsAvailable) {
    // only check for compilers if pioasm
    if (compiler === null) {
      requirementsMet = false;
    }
  }

  if (!requirementsMet) {
    void showInstallationRequirementsNotMetErrorMessage(
      git !== null,
      allToolsAvailable || compiler !== null
    );
  }

  return requirementsMet;
}

export async function showInstallationRequirementsNotMetErrorMessage(
  isGitInstalled: boolean,
  allToolsAvailableOrCompilerInstalled: boolean
): Promise<void> {
  if (!isGitInstalled && process.platform !== "darwin") {
    await window.showErrorMessage(
      "Installation of the Pico-SDK requires Git " +
        "to be installed and available in the PATH."
    );
  }
  if (!allToolsAvailableOrCompilerInstalled) {
    await window.showErrorMessage(
      "A native C/C++ compiler (clang or gcc) needs to be installed and in " +
        "PATH for manual compilation of the tools." +
        "Please install and restart VS Code."
    );
  }
}
