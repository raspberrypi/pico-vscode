import { CommandWithResult } from "./command.mjs";
import { workspace } from "vscode";
import { getPythonPath, getPath } from "../utils/cmakeUtil.mjs";

export class GetPythonPathCommand
                      extends CommandWithResult<string> {
  constructor() {
    super("getPythonPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const pythonPath = await getPythonPath();

    return pythonPath;
  }
}

export class GetEnvPathCommand
                      extends CommandWithResult<string> {
  constructor() {
    super("getEnvPath");
  }

  async execute(): Promise<string> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      return "";
    }

    const path = await getPath();

    return path;
  }
}
