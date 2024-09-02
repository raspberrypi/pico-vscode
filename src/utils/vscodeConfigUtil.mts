import { readFile, writeFile } from "fs/promises";
import Logger from "../logger.mjs";
import { join } from "path";
import { SettingsKey } from "../settings.mjs";
import { type WorkspaceConfiguration, workspace } from "vscode";
import { dirname } from "path/posix";
import { compareGe } from "./semverUtil.mjs";

interface Configuration {
  includePath: string[];
  forcedInclude: string[];
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
        item => !item.startsWith("${userHome}/.pico-sdk")
      );
      // Add the new pico-sdk includePath
      config.includePath.push(`\${userHome}/.pico-sdk/sdk/${newSDKVersion}/**`);

      // Remove the old pico-sdk forcedInclude values set by this extension
      config.forcedInclude = config.forcedInclude.filter(
        item => !item.startsWith("${userHome}/.pico-sdk")
      );
      const baseHeadersFolderName = compareGe(newSDKVersion, "2.0.0")
        ? "pico_base_headers"
        : "pico_base";
      // Add the new pico-sdk forcedInclude
      config.forcedInclude.push(
        `\${userHome}/.pico-sdk/sdk/${newSDKVersion}` +
          `/src/common/${baseHeadersFolderName}/include/pico.h`
      );

      // Update the compilerPath
      config.compilerPath =
        "${userHome}/.pico-sdk/toolchain" +
        `/${newToolchainVersion}/bin/${
          newToolchainVersion.includes("RISCV")
            ? newToolchainVersion.includes("COREV")
              ? "riscv32-corev-elf-gcc"
              : "riscv32-unknown-elf-gcc"
            : "arm-none-eabi-gcc"
        }`;
    });

    // Write the updated JSON back to the file
    const updatedJsonData = JSON.stringify(cppProperties, null, 4);
    await writeFile(file, updatedJsonData, "utf8");

    console.log("cpp_properties.json file updated successfully.");
  } catch {
    Logger.log("Error updating cpp_properties.json file.");
  }
}

async function updateTasksFile(
  tasksFile: string,
  newNinjaVersion: string
): Promise<void> {
  // read tasksFile (it contains the path)
  let content = await readFile(tasksFile, "utf8");

  // if a string with following format .pico-sdk/ninja/<version>/ exists
  // then replace <version> with the new version
  if (content.includes(".pico-sdk/ninja/")) {
    const oldNinjaVersion = content.match(/(?<=\.pico-sdk\/ninja\/)(.*)(?=\/)/);
    if (oldNinjaVersion !== null) {
      content = content.replaceAll(
        `.pico-sdk/ninja/${oldNinjaVersion[0]}`,
        `.pico-sdk/ninja/${newNinjaVersion}`
      );
    }
  }

  // save tasksFile
  await writeFile(tasksFile, content, "utf8");
}

function buildCMakePath(cmakeVersion: string): string {
  return `\${userHome}/.pico-sdk/cmake/${cmakeVersion}/bin/cmake`;
}

function buildCMakeHomePath(cmakeVersion: string): string {
  return `\${HOME}/.pico-sdk/cmake/${cmakeVersion}/bin/cmake`;
}

function buildNinjaHomePath(ninjaVersion: string): string {
  return `\${HOME}/.pico-sdk/ninja/${ninjaVersion}/ninja`;
}

async function updateSettingsFile(
  newSDKVersion: string,
  newToolchainVersion: string,
  newNinjaVersion?: string,
  newCMakeVersion?: string
): Promise<void> {
  const workspaceFolder = workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const config: WorkspaceConfiguration = workspace.getConfiguration(
    undefined,
    workspaceFolder
  );

  for (const key of [
    "terminal.integrated.env.windows",
    "terminal.integrated.env.osx",
    "terminal.integrated.env.linux",
  ]) {
    if (!config.has(key)) {
      await config.update(key, {}, null);
    }

    const currentValue: { [key: string]: string } = config.get(key) ?? {};

    currentValue["PICO_SDK_PATH"] = `\${${
      key.includes("windows") ? "env:USERPROFILE" : "env:HOME"
    }}/.pico-sdk/sdk/${newSDKVersion}`;
    currentValue["PICO_TOOLCHAIN_PATH"] = `\${${
      key.includes("windows") ? "env:USERPROFILE" : "env:HOME"
    }}/.pico-sdk/toolchain/${newToolchainVersion}`;

    // PATH
    // replace env: with env_ before splitting at :
    const oldPath = currentValue[
      key.includes("windows") ? "Path" : "PATH"
    ].replaceAll("${env:", "${env_");
    Logger.log(`Oldpath ${oldPath}`);
    const pathList = oldPath.split(key.includes("windows") ? ";" : ":");
    let toolchainIdx = -1;
    let cmakeIdx = -1;
    let ninjaIdx = -1;

    for (let i = 0; i < pathList.length; i++) {
      pathList[i] = pathList[i].replaceAll("${env_", "${env:");
      Logger.log(pathList[i]);
      const item = pathList[i];
      if (item.includes(".pico-sdk/toolchain")) {
        toolchainIdx = i;
      }
      if (item.includes(".pico-sdk/cmake")) {
        cmakeIdx = i;
      }
      if (item.includes(".pico-sdk/ninja")) {
        ninjaIdx = i;
      }
    }

    Logger.log(`PathList ${pathList.join(" - ")}`);

    pathList[toolchainIdx] = currentValue["PICO_TOOLCHAIN_PATH"] + "/bin";

    if (newCMakeVersion && newCMakeVersion !== "cmake") {
      let newCmakePath = "";
      if (!newCMakeVersion.includes("/")) {
        newCmakePath = `\${${
          key.includes("windows") ? "env:USERPROFILE" : "env:HOME"
        }}/.pico-sdk/cmake/${newCMakeVersion}/bin`;
      } else {
        newCmakePath = dirname(newCMakeVersion);
      }
      if (cmakeIdx > 0) {
        pathList[cmakeIdx] = newCmakePath;
      } else {
        pathList.splice(pathList.length - 1, 0, newCmakePath);
      }
    }

    if (newNinjaVersion && newNinjaVersion !== "ninja") {
      let newNinjaPath = "";
      if (!newNinjaVersion.includes("/")) {
        newNinjaPath = `\${${
          key.includes("windows") ? "env:USERPROFILE" : "env:HOME"
        }}/.pico-sdk/ninja/${newNinjaVersion}`;
      } else {
        newNinjaPath = dirname(newNinjaVersion);
      }
      if (ninjaIdx > 0) {
        pathList[ninjaIdx] = newNinjaPath;
      } else {
        pathList.splice(pathList.length - 1, 0, newNinjaPath);
      }
    }

    const newPath = pathList.join(key.includes("windows") ? ";" : ":");
    currentValue[key.includes("windows") ? "Path" : "PATH"] = newPath;

    await config.update(key, currentValue, null);
  }

  if (newNinjaVersion) {
    await config.update(
      "raspberry-pi-pico." + SettingsKey.ninjaPath,
      buildNinjaHomePath(newNinjaVersion),
      null
    );
  }
  if (newCMakeVersion) {
    await config.update(
      "cmake.cmakePath",
      buildCMakePath(newCMakeVersion),
      null
    );
    await config.update(
      "raspberry-pi-pico." + SettingsKey.cmakePath,
      buildCMakeHomePath(newCMakeVersion),
      null
    );
  }
}

async function updateLaunchFile(
  launchFile: string,
  newSDKVersion: string
): Promise<void> {
  let content = await readFile(launchFile, "utf8");

  if (content.includes(".pico-sdk/sdk/")) {
    const oldPicoSDKVersion = content.match(
      /(?<=\.pico-sdk\/sdk\/)([^/]*)(?=\/)/
    );
    if (oldPicoSDKVersion !== null) {
      content = content.replaceAll(
        `.pico-sdk/sdk/${oldPicoSDKVersion[0]}`,
        `.pico-sdk/sdk/${newSDKVersion}`
      );
    }
  }

  // save launchFile
  await writeFile(launchFile, content, "utf8");
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
  newToolchainVersion: string,
  newNinjaVersion?: string,
  newCMakeVersion?: string
): Promise<void> {
  const cppPropertiesFile = join(folder, ".vscode", "c_cpp_properties.json");
  await updateCppPropertiesFile(
    cppPropertiesFile,
    newSDKVersion,
    newToolchainVersion
  );

  await updateSettingsFile(
    newSDKVersion,
    newToolchainVersion,
    newNinjaVersion,
    newCMakeVersion
  );

  const launchFile = join(folder, ".vscode", "launch.json");
  await updateLaunchFile(launchFile, newSDKVersion);

  if (newNinjaVersion) {
    const tasksFile = join(folder, ".vscode", "tasks.json");
    await updateTasksFile(tasksFile, newNinjaVersion);
  }
}
