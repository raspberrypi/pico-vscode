import { readFile, writeFile } from "fs/promises";
import Logger from "../logger.mjs";
import { join } from "path";

interface Configuration {
  compilerPath: string;
}

interface CppProperties {
  configurations: Configuration[];
}

async function updateCppPropertiesFile(
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
