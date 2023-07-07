import { readFileSync } from "fs";
import { CommandWithResult } from "./command.mjs";
import { workspace } from "vscode";
import { join } from "path";

export default class LaunchTargetPathCommand extends CommandWithResult<string> {
  constructor() {
    super("launchTargetPath");
  }

  private readProjectNameFromCMakeLists(filename: string): string | null {
    // Read the file
    const fileContent = readFileSync(filename, "utf-8");

    // Match the project line using a regular expression
    const regex = /project\(([^)\s]+)/;
    const match = regex.exec(fileContent);

    // Extract the project name from the matched result
    if (match && match[1]) {
      const projectName = match[1].trim();

      return projectName;
    }

    return null; // Return null if project line is not found
  }

  execute(): string {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const fsPathFolder = workspace.workspaceFolders[0].uri.fsPath;

    const projectName = this.readProjectNameFromCMakeLists(
      join(fsPathFolder, "CMakeLists.txt")
    );

    if (projectName === null) {
      return "";
    }

    return join(fsPathFolder, "build", projectName + ".elf");
  }
}
