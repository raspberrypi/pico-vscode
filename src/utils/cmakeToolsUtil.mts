import { commands, extensions } from "vscode";
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


// Long enough for CMake Tools to scan for kits, which setKitByName can trigger
const CMAKE_TOOLS_COMMAND_TIMEOUT_MS = 15000;

/**
 * Run a CMake Tools command, giving up if it doesn't return in time.
 *
 * If CMake Tools has already started with no kit selected, these commands can
 * wait indefinitely (e.g. on a kit selection prompt), and as they're awaited
 * during activation that would stall the whole extension.
 */
async function cmakeToolsCommand(
  command: string,
  ...args: unknown[]
): Promise<{ timedOut: boolean; result?: unknown }> {
  const onCommand = commands
    .executeCommand(command, ...args)
    .then(result => ({ timedOut: false, result }));
  const onTimeout = new Promise<{ timedOut: boolean }>(resolve => {
    setTimeout(resolve, CMAKE_TOOLS_COMMAND_TIMEOUT_MS, { timedOut: true });
  });

  const value = await Promise.race([onCommand, onTimeout]);
  if (value.timedOut) {
    Logger.warn(LoggerSource.cmake, `CMake Tools command ${command} timed out`);
  }

  return value;
}

export async function cmakeToolsForcePicoKit(): Promise<boolean> {

  if (!await cmakeToolsActivate()) {
    // Give up and return, as this function is non-essential
    Logger.warn(LoggerSource.cmake, "cmakeToolsExtension not available yet");

    return false;
  }

  const buildKit = await cmakeToolsCommand("cmake.buildKit");
  if (buildKit.timedOut) {
    return false;
  }
  if (buildKit.result !== "Pico") {
    const setKit = await cmakeToolsCommand("cmake.setKitByName", "Pico");
    if (setKit.timedOut) {
      return false;
    }
  }

  return true;
}
