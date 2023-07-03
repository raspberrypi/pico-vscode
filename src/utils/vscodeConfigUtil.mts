import { readFile, writeFile } from "fs/promises";
import Logger from "../logger.mjs";
import { join } from "path";
import { EOL } from "os";

interface Configuration {
  name: string;
  includePath: string[];
  defines: string[];
  compilerPath: string;
  cStandard: string;
  cppStandard: string;
  intelliSenseMode: string;
  configurationProvider: string;
}

interface CppProperties {
  configurations: Configuration[];
}

export async function updateCppPropertiesFile(
  file: string,
  newCompilerPath: string
): Promise<void> {
  try {
    // Read the JSON file
    const jsonData = await readFile(file, "utf8");
    const cppProperties: CppProperties = JSON.parse(jsonData) as CppProperties;

    // Update the compilerPath value
    cppProperties.configurations.forEach(config => {
      config.compilerPath = newCompilerPath;
    });

    // Write the updated JSON back to the file
    const updatedJsonData = JSON.stringify(cppProperties, null, 2);
    await writeFile(file, updatedJsonData, "utf8");

    console.log("cpp_properties.json file updated successfully.");
  } catch (error) {
    Logger.log("Error updating cpp_properties.json file.");
  }
}

interface ExtensionsJSON {
  recommendations: string[];
}

export async function updateExtensionsJSONFile(
  file: string,
  newExtensionId: string
): Promise<void> {
  try {
    // Read the JSON file
    const jsonData = await readFile(file, "utf8");
    const extensionsJSON: ExtensionsJSON = JSON.parse(
      jsonData
    ) as ExtensionsJSON;

    // Check if the new extension is already present in recommendations
    const isAlreadyRecommended =
      extensionsJSON.recommendations.includes(newExtensionId);
    if (!isAlreadyRecommended) {
      // Add the new extension to recommendations
      extensionsJSON.recommendations.push(newExtensionId);

      // Write the updated JSON back to the file
      const updatedJsonData = JSON.stringify(extensionsJSON, null, 2);
      await writeFile(file, updatedJsonData, "utf8");

      Logger.log("extensions.json file updated successfully.");
    } else {
      Logger.log(`Extension '${newExtensionId}' is already recommended.`);
    }
  } catch (error) {
    // TODO: log error
    Logger.log("An error occurred while updating the extensions.json file.");
  }
}

/**
 * Replaces the ${env:PICO_SDK_PATH} variable in a given file with the given replacement
 *
 * @param file Path to the file
 * @param replacement Replacement string for the ${env:PICO_SDK_PATH} variable
 */
async function replacePicoSDKPathVariable(
  file: string,
  replacement: string
): Promise<void> {
  try {
    // Read the JSON file
    const jsonData = await readFile(file, "utf8");

    // Perform the replacement
    const updatedJsonString = jsonData.replace(
      /\$\{env:PICO_SDK_PATH\}/g,
      replacement
    );

    // Write the updated JSON back to the file
    await writeFile(file, updatedJsonString, "utf8");

    Logger.log("launch.json file updated successfully.");
  } catch (error) {
    Logger.log("An error occurred while updating the launch.json file.");
  }
}

async function removeLineFromFile(
  filePath: string,
  startsWith: string
): Promise<void> {
  try {
    const fileContent = await readFile(filePath, "utf8");
    const lines = fileContent.split("\n");
    const updatedContent = lines
      .filter(line => !line.trim().startsWith(startsWith))
      .join(EOL);

    await writeFile(filePath, updatedContent, "utf8");
    Logger.log(`Line starting with "${startsWith}" removed from ${filePath}`);
  } catch (error) {
    Logger.log("Error while removing the line");
  }
}

export async function redirectVSCodeConfig(
  folder: string,
  extensionId: string,
  extensionName: string
): Promise<void> {
  // eslint-disable-next-line max-len
  const redirectedPicoSDKPathVariable = `\${command:${extensionName}.getSDKPath}`;
  // eslint-disable-next-line max-len
  const redirectedToolchainPathVariable = `\${command:${extensionName}.getToolchainPath}`;

  const cppPropertiesFile = join(folder, "cpp_properties.json");
  await updateCppPropertiesFile(
    cppPropertiesFile,
    redirectedToolchainPathVariable
  );

  await replacePicoSDKPathVariable(
    cppPropertiesFile,
    redirectedPicoSDKPathVariable
  );

  await updateExtensionsJSONFile(join(folder, "extensions.json"), extensionId);

  await replacePicoSDKPathVariable(
    join(folder, "launch.json"),
    redirectedPicoSDKPathVariable
  );

  // TODO: maybe search sub directories too to find the CMakeLists.txt file?
  await removeLineFromFile(join(folder, "CMakeLists.txt"), "set(PICO_SDK_PATH");
}
