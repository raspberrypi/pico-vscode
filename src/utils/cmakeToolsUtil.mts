import { commands, extensions, type Uri } from "vscode";
import {
  type CMakeToolsApi,
  getCMakeToolsApi,
  Version,
} from "vscode-cmake-tools";
import Logger, { LoggerSource } from "../logger.mjs";

export async function cmakeToolsActivate(): Promise<boolean> {
  // Check if the CMake Tools extension is installed and active
  let foundCmakeToolsExtension = false;
  for (let i = 0; i < 2; i++) {
    const cmakeToolsExtension = extensions.getExtension(
      "ms-vscode.cmake-tools"
    );
    if (cmakeToolsExtension !== undefined) {
      Logger.debug(
        LoggerSource.cmake,
        `cmakeToolsExtension: ${cmakeToolsExtension.isActive}`
      );

      if (cmakeToolsExtension.isActive) {
        foundCmakeToolsExtension = true;
        break;
      }

      // Attempt to activate the extension
      const onActivate = cmakeToolsExtension.activate();
      const onTimeout = new Promise<string>(resolve => {
        setTimeout(resolve, 2000, "timeout");
      });

      await Promise.race([onActivate, onTimeout]).then(value => {
        if (value === "timeout") {
          Logger.warn(
            LoggerSource.cmake,
            "CMake Tools Extension activation timed out"
          );
          foundCmakeToolsExtension = false;
        } else {
          foundCmakeToolsExtension = true;
        }
      });
    } else {
      // Undefined if not installed/disabled
      Logger.debug(LoggerSource.cmake, `cmakeToolsExtension: undefined`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return foundCmakeToolsExtension;
}


export async function cmakeToolsForcePicoKit(): Promise<boolean> {

  if (!await cmakeToolsActivate()) {
    // Give up and return, as this function is non-essential
    Logger.warn(LoggerSource.cmake, "cmakeToolsExtension not available yet");

    return false;
  }

  const cmakeToolsKit = await commands.executeCommand("cmake.buildKit");
  if (cmakeToolsKit !== "Pico") {
    await commands.executeCommand("cmake.setKitByName", "Pico");
  }

  return true;
}

// Settles once activation has tried to set the Pico kit, for tests to wait on
let resolvePicoKitSet: (kitSet: boolean) => void;
const picoKitSet = new Promise<boolean>(resolve => {
  resolvePicoKitSet = resolve;
});

/**
 * Wait for activation to set the Pico kit.
 *
 * @returns Whether the kit was set. Never settles if the project doesn't use
 * CMake Tools, so only for tests of projects that do.
 */
export function cmakeToolsWaitForPicoKit(): Promise<boolean> {
  return picoKitSet;
}

/**
 * Wait until CMake Tools has created its project for the folder.
 */
async function cmakeToolsWaitForProject(
  api: CMakeToolsApi,
  folder: Uri
): Promise<void> {
  await new Promise<void>(resolve => {
    const check = async (): Promise<void> => {
      if ((await api.getProject(folder)) !== undefined) {
        listener.dispose();
        resolve();
      }
    };
    // Listen before checking, so a project created in between isn't missed
    const listener = api.onActiveProjectChanged(() => void check());
    void check();
  });
}

/**
 * Set the CMake Tools kit to Pico on activation.
 *
 * This waits for CMake Tools to activate and create its project, so call it
 * without awaiting it. It can't check the kit first, as cmake.buildKit prompts
 * the user to select a kit if none is set yet, and cmake.setKitByName does
 * nothing until the project exists, but doesn't prompt (and closes any kit
 * prompt that's open).
 */
export async function cmakeToolsForcePicoKitOnActivation(
  folder: Uri
): Promise<boolean> {
  let kitSet = false;
  try {
    const api = await getCMakeToolsApi(Version.v1);
    if (api === undefined) {
      Logger.warn(LoggerSource.cmake, "CMake Tools API not available");
    } else {
      await cmakeToolsWaitForProject(api, folder);
      await commands.executeCommand("cmake.setKitByName", "Pico");
      kitSet = true;
    }
  } finally {
    resolvePicoKitSet(kitSet);
  }

  return kitSet;
}
