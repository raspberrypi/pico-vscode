import { readFileSync } from "fs";
import { CommandWithResult } from "./command.mjs";
import { commands, window, workspace } from "vscode";
import { join } from "path";
import Settings, { SettingsKey } from "../settings.mjs";
import State from "../state.mjs";
import { parse as parseToml } from "toml";
import { join as joinPosix } from "path/posix";
import { cmakeToolsForcePicoKit } from "../utils/cmakeToolsUtil.mjs";

export default class LaunchTargetPathCommand extends CommandWithResult<string> {
  public static readonly id = "launchTargetPath";

  constructor() {
    super(LaunchTargetPathCommand.id);
  }

  private async readProjectNameFromCMakeLists(
    filename: string
  ): Promise<string | null> {
    // Read the file
    const fileContent = readFileSync(filename, "utf-8");

    // Match the project line using a regular expression
    const regex = /project\(([^)\s]+)/;
    const match = regex.exec(fileContent);

    // Match for poll and threadsafe background inclusions
    const regexBg = /pico_cyw43_arch_lwip_threadsafe_background/;
    const matchBg = regexBg.exec(fileContent);
    const regexPoll = /pico_cyw43_arch_lwip_poll/;
    const matchPoll = regexPoll.exec(fileContent);

    // Extract the project name from the matched result
    if (match && match[1]) {
      const projectName = match[1].trim();

      if (matchBg && matchPoll) {
        // For examples with both background and poll, let user pick which to run
        const quickPickItems = ["Threadsafe Background", "Poll"];
        const backgroundOrPoll = await window.showQuickPick(quickPickItems, {
          placeHolder: "Select PicoW Architecture",
        });
        if (backgroundOrPoll === undefined) {
          return projectName;
        }

        switch (backgroundOrPoll) {
          case quickPickItems[0]:
            return projectName + "_background";
          case quickPickItems[1]:
            return projectName + "_poll";
        }
      }

      return projectName;
    }

    return null; // Return null if project line is not found
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const isRustProject = State.getInstance().isRustProject;

    if (isRustProject) {
      const cargoTomlPath = join(
        workspace.workspaceFolders[0].uri.fsPath,
        "Cargo.toml"
      );
      const contents = readFileSync(cargoTomlPath, "utf-8");
      const cargoToml = (await parseToml(contents)) as
        | {
            package?: { name?: string };
          }
        | undefined;

      if (cargoToml?.package?.name) {
        return joinPosix(
          workspace.workspaceFolders[0].uri.fsPath.replaceAll("\\", "/"),
          "target",
          "thumbv6m-none-eabi",
          "debug",
          cargoToml.package.name
        );
      }

      return "";
    }

    const settings = Settings.getInstance();
    if (
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      // Ensure the Pico kit is selected
      await cmakeToolsForcePicoKit();

      // Compile with CMake Tools
      const path: string = await commands.executeCommand(
        "cmake.launchTargetPath"
      );
      if (path) {
        return path.replaceAll("\\", "/");
      }
    }

    const fsPathFolder = workspace.workspaceFolders[0].uri.fsPath;

    const projectName = await this.readProjectNameFromCMakeLists(
      join(fsPathFolder, "CMakeLists.txt")
    );

    if (projectName === null) {
      return "";
    }

    // Compile before returning
    const compiled = await commands.executeCommand(
      "raspberry-pi-pico.compileProject"
    );

    if (!compiled) {
      throw new Error(
        "Failed to compile project - check output from the Compile Project task"
      );
    }

    return join(fsPathFolder, "build", projectName + ".elf").replaceAll(
      "\\",
      "/"
    );
  }
}

export class LaunchTargetPathReleaseCommand extends CommandWithResult<string> {
  public static readonly id = "launchTargetPathRelease";

  constructor() {
    super(LaunchTargetPathReleaseCommand.id);
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const isRustProject = State.getInstance().isRustProject;

    if (!isRustProject) {
      return "";
    }

    const cargoTomlPath = join(
      workspace.workspaceFolders[0].uri.fsPath,
      "Cargo.toml"
    );
    const contents = readFileSync(cargoTomlPath, "utf-8");
    const cargoToml = (await parseToml(contents)) as
      | {
          package?: { name?: string };
        }
      | undefined;

    if (cargoToml?.package?.name) {
      return joinPosix(
        workspace.workspaceFolders[0].uri.fsPath.replaceAll("\\", "/"),
        "target",
        "thumbv6m-none-eabi",
        "release",
        cargoToml.package.name
      );
    }

    return "";
  }
}
