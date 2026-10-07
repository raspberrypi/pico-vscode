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


/**
 * Set the CMake Tools kit to Pico.
 *
 * @param checkKit Only set the kit if it isn't already Pico. Checking uses
 * cmake.buildKit, which prompts the user to select a kit if none is active, so
 * pass false when CMake Tools may not have a kit yet (e.g. on activation).
 * cmake.setKitByName never prompts, and closes the prompt if it's open.
 */
export async function cmakeToolsForcePicoKit(
  checkKit: boolean = true
): Promise<boolean> {

  if (!await cmakeToolsActivate()) {
    // Give up and return, as this function is non-essential
    Logger.warn(LoggerSource.cmake, "cmakeToolsExtension not available yet");

    return false;
  }

  if (checkKit) {
    const cmakeToolsKit = await commands.executeCommand("cmake.buildKit");
    if (cmakeToolsKit === "Pico") {
      return true;
    }
  }

  await commands.executeCommand("cmake.setKitByName", "Pico");

  return true;
}
