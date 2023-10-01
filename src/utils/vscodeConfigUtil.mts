import { readFile, writeFile } from "fs/promises";
import Logger from "../logger.mjs";
import { join } from "path";

interface Configuration {
  includePath: string[];
  compilerPath: string;
}

interface CppProperties {
  configurations: Configuration[];
}

async function updateCppPropertiesFile(
  file: string,
  newSDKVersion: string,
  newToolchainVersion: string
): Promise<void> {
  try {
    // Read the JSON file
    const jsonData = await readFile(file, "utf8");
    const cppProperties: CppProperties = JSON.parse(jsonData) as CppProperties;

    // Update the compilerPath value
    cppProperties.configurations.forEach(config => {
      // Remove the old pico-sdk includePath values set by this extension
      config.includePath = config.includePath.filter(
        item => !item.startsWith("${env:HOME}/.pico-sdk")
      );
      // Add the new pico-sdk includePath
      config.includePath.push(`\${env:HOME}/.pico-sdk/sdk/${newSDKVersion}/**`);
      // Update the compilerPath
      config.compilerPath =
        "${env:HOME}/.pico-sdk/toolchain" +
        `/${newToolchainVersion}/bin/${
          // "arm-none-eabi-gcc" should work on all platforms no need for extension on Windows
          /*process.platform === "win32"
          ? "arm-none-eabi-gcc.exe"
          : "arm-none-eabi-gcc"*/
          "arm-none-eabi-gcc"
        }`;
    });

    // Write the updated JSON back to the file
    const updatedJsonData = JSON.stringify(cppProperties, null, 4);
    await writeFile(file, updatedJsonData, "utf8");

    console.log("cpp_properties.json file updated successfully.");
  } catch (error) {
    Logger.log("Error updating cpp_properties.json file.");
  }
}

/**
 * Updates the configs in .vscode/*.json files with the new SDK and toolchain versions.
 *
 * @param folder Path to the workspace folder containing the .vscode folder.
 * @param newSDKVersion The new SDK version to set.
 * @param newToolchainVersion The new toolchain version to set.
 */
export async function updateVSCodeStaticConfigs(
  folder: string,
  newSDKVersion: string,
  newToolchainVersion: string
): Promise<void> {
  const cppPropertiesFile = join(folder, ".vscode", "c_cpp_properties.json");
  await updateCppPropertiesFile(
    cppPropertiesFile,
    newSDKVersion,
    newToolchainVersion
  );
}
