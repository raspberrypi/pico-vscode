import { readFile, writeFile } from "fs/promises";
import Logger from "../logger.mjs";
import { join } from "path";
import { EOL } from "os";
import { SettingsKey } from "../settings.mjs";

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
    const updatedJsonData = JSON.stringify(cppProperties, null, 4);
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
    Logger.log("An error occurred while replacing PICO_SDK_PATH variable.");
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

interface SettingsJSON {
  [key: string]: unknown;
}

async function addSetting(
  filePath: string,
  setting: string,
  value: string | boolean
): Promise<void> {
  try {
    // Read the JSON file
    const jsonData = await readFile(filePath, "utf8");
    const settingsJSON: SettingsJSON = JSON.parse(jsonData) as SettingsJSON;
    settingsJSON[setting] = value;
    await writeFile(filePath, JSON.stringify(settingsJSON, null, 4), "utf8");

    Logger.log("Pico SDK version set successfully for new project.");
  } catch (error) {
    // TODO: log error
    Logger.log(
      "An error occurred while settings Pico SDK version for new project."
    );
  }
}

/**
 * Modifies auto-generated VSCode configuration files to integrate
 * with this extension. This includes:
 * - replacing paths with ${command:extension.getSDKPath} and ${command:extension.getToolchainPath}
 * - adding the extension to the list of recommended extensions
 * - adding the Pico SDK version to the list of settings
 * - removing the set(PICO_SDK_PATH ...) from CMakeLists.txt so it uses the one set by the ext
 *
 * @param folder
 * @param extensionId
 * @param extensionName
 * @param toolchainPath
 * @param newSDKVersion
 */
export async function redirectVSCodeConfig(
  folder: string,
  extensionId: string,
  extensionName: string,
  // WORKAROUND: as c_cpp_properties.json from vscode-cpptools
  // does not support ${command:} variables at the moment
  toolchainPath: string,
  newSDKVersion?: string
): Promise<void> {
  // eslint-disable-next-line max-len
  const redirectedPicoSDKPathVariable = `\${command:${extensionName}.getSDKPath}`;
  // eslint-disable-next-line max-len
  // WORKAROUND: const redirectedToolchainPathVariable = `\${command:${extensionName}.getToolchainPath}`;

  await updateVSCodeStaticConfigs(folder, toolchainPath);

  // WORKAROUND: c_cpp_properties.json from vscode-cpptools
  // does not support ${command:} variables at the moment
  /*await replacePicoSDKPathVariable(
    cppPropertiesFile,
    redirectedPicoSDKPathVariable
  );*/

  await updateExtensionsJSONFile(join(folder, "extensions.json"), extensionId);

  await replacePicoSDKPathVariable(
    join(folder, "launch.json"),
    redirectedPicoSDKPathVariable
  );

  // TODO: maybe search sub directories too to find the CMakeLists.txt file?
  // TODO: maybe repalce the path with the one selected by the user so it can
  // also be build from the command line? where the ext can edit the path before cmake
  // but also once the project is configured
  // with cmake -G Ninja, CMakeLists.txt is not used anymore (ideally)
  await removeLineFromFile(
    join(folder, "..", "CMakeLists.txt"),
    "set(PICO_SDK_PATH"
  );

  if (newSDKVersion) {
    await addSetting(
      join(folder, "settings.json"),
      [extensionName, SettingsKey.picoSDK].join("."),
      newSDKVersion
    );
  }

  // disable cmake confgiuring
  await addSetting(
    join(folder, "settings.json"),
    "cmake.configureOnOpen",
    false
  );
  await addSetting(
    join(folder, "settings.json"),
    "cmake.automaticReconfigure",
    false
  );
  await addSetting(
    join(folder, "settings.json"),
    "cmake.configureOnEdit",
    false
  );
}

export async function updateVSCodeStaticConfigs(
  folder: string,
  toolchainPath: string
): Promise<void> {
  const cppPropertiesFile = join(folder, "c_cpp_properties.json");
  // WORKAROUND: because c_cpp_properties.json from vscode-cpptools
  // does not support dynamic variables
  await updateCppPropertiesFile(
    cppPropertiesFile,
    join(
      toolchainPath,
      process.platform === "win32"
        ? "arm-none-eabi-gcc.exe"
        : "arm-none-eabi-gcc"
    )
  );
}
