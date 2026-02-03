import { commands, extensions } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";

export async function cmakeToolsForcePicoKit(): Promise<void> {
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

  if (!foundCmakeToolsExtension) {
    // Give up and return, as this function is non-essential
    Logger.warn(LoggerSource.cmake, "cmakeToolsExtension not available yet");

    return;
  }

  const cmakeToolsKit = await commands.executeCommand("cmake.buildKit");
  if (cmakeToolsKit !== "Pico") {
    await commands.executeCommand("cmake.setKitByName", "Pico");
  }
}
