import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { extensions } from "vscode";
import Logger from "../logger.mjs";

/**
 * Sets the PICO_SDK_PATH environment variable for vscode
 * but also preserves the systems PICO_SDK_PATH variable if set.
 *
 * @param path New PICO_SDK_PATH
 */
export function setPicoSDKPath(path: string, extensionId?: string): void {
  if (process.env.PICO_SDK_PATH) {
    process.env.OLD_PICO_SDK_PATH = process.env.PICO_SDK_PATH;
  }
  process.env.PICO_SDK_PATH = path;

  if (!extensionId) {
    return;
  }

  // WORKAROUND: cpptools not supporting ${command:} syntax so ${env:} is the only one working
  // but this requires us to set PICO_SDK_PATH before cpptools extension is loaded
  // and checks its c_cpp_properties.json
  const cppToolsPath =
    extensions.getExtension("ms-vscode.cpptools")?.extensionPath;
  if (cppToolsPath) {
    const cppToolsPacakgeJsonPath = join(cppToolsPath, "package.json");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonData = JSON.parse(
        readFileSync(cppToolsPacakgeJsonPath, "utf8")
      );

      // Check if 'extensionDependencies' property exists
      // eslint-disable-next-line max-len
      // eslint-disable-next-line no-prototype-builtins, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (!jsonData.hasOwnProperty("extensionDependencies")) {
        // Add 'extensionDependencies' property with an empty array
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        jsonData.extensionDependencies = [];
      }

      // Add 'extensid' to 'extensionDependencies' array if not already present
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const extensionDependencies = jsonData.extensionDependencies as string[];
      if (!extensionDependencies.includes(extensionId)) {
        extensionDependencies.push(extensionId);
      } else {
        // don't write to avoid vscode asking to reload because ext changed on disk
        return;
      }

      // Write the modified JSON back to the file
      writeFileSync(cppToolsPacakgeJsonPath, JSON.stringify(jsonData, null, 4));
    } catch (error) {
      Logger.log("Error while modifying cpptools.");
    }
  }
}

export function removeCppToolsDependency(extensionId: string): void {
  const cppToolsPath =
    extensions.getExtension("ms-vscode.cpptools")?.extensionPath;
  if (cppToolsPath) {
    const cppToolsPacakgeJsonPath = join(cppToolsPath, "package.json");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const jsonData = JSON.parse(
        readFileSync(cppToolsPacakgeJsonPath, "utf8")
      );

      // Check if 'extensionDependencies' property exists
      // eslint-disable-next-line max-len
      // eslint-disable-next-line no-prototype-builtins, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (!jsonData.hasOwnProperty("extensionDependencies")) {
        // Add 'extensionDependencies' property with an empty array
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        jsonData.extensionDependencies = [];
      }

      // Add 'extensid' to 'extensionDependencies' array if not already present
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const extensionDependencies = jsonData.extensionDependencies as string[];
      const idx = extensionDependencies.indexOf(extensionId);
      if (idx > -1) {
        extensionDependencies.splice(idx, 1);
      } else {
        // don't write to avoid vscode asking to reload because ext changed on disk
        return;
      }

      // Write the modified JSON back to the file
      writeFileSync(cppToolsPacakgeJsonPath, JSON.stringify(jsonData, null, 4));
    } catch (error) {
      Logger.log("Error while modifying cpptools.");
    }
  }
}

export function setToolchainPath(path: string): void {
  process.env.PICO_TOOLCHAIN_PATH = path;
  if (process.platform === "win32") {
    process.env.Path = `${path};${process.env.Path ?? ""}`;
  } else {
    process.env.PATH = `${path};${process.env.PATH ?? ""}`;
  }
}

/**
 * Retrieves the PICO_SDK_PATH environment variable from outside vscode.
 * Usefull for detecting the pico-sdk set by the user outside of vscode by env variable.
 *
 * @returns PICO_SDK_PATH environment variable unmatched by the extension
 */
export function getSystemPicoSDKPath(): string | undefined {
  // if there was PICO_SDK_PATH set outside of vscode, use it
  return process.env.OLD_PICO_SDK_PATH || undefined;
}
