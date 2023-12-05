import { window } from "vscode";
import which from "which";
import type Settings from "../settings.mjs";
import { SettingsKey } from "../settings.mjs";
import { downloadGit } from "./download.mjs";

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
  const tools: string[] = ["pioasm", "elf2uf2"];

  const git: string | null = await which(gitExe, { nothrow: true });
  //check if any of the compilers is available
  const compiler: string | null = await Promise.any(
    compilerExe
      .map(compiler => which(compiler, { nothrow: true }))
      .map(p => p.catch(() => null))
  );
  // check for avialbility of tools
  let allToolsAvailable: boolean = true;
  for (const tool of tools) {
    const toolPath: string | null = await which(tool, { nothrow: true });
    if (toolPath === null) {
      allToolsAvailable = false;
      break;
    }
  }

  let requirementsMet: boolean = true;
  if (git === null) {
    if (process.platform === "linux") {
      requirementsMet = false;
    } else {
      // install if not available
      const gitDownloaded: string | undefined = await downloadGit();

      if (gitDownloaded === undefined) {
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
  if (!isGitInstalled) {
    await window.showErrorMessage(
      "Installation of the Pico-SDK requires Git " +
        "to be installed and available in the PATH."
    );
  }
  if (!allToolsAvailableOrCompilerInstalled) {
    await window.showErrorMessage(
      "Either pioasm and elf2uf2 need to be installed and in PATH or " +
        "a native C/C++ compiler (clang or gcc) needs to be installed and in " +
        "PATH for manuall compilation of the tools." +
        "Please install and restart VS Code."
    );
  }
}
