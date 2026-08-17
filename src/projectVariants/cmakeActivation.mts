import { basename, join } from "path";
import { workspace, type WorkspaceFolder } from "vscode";
import Logger, { LoggerSource } from "../logger.mjs";
import type UI from "../ui.mjs";
import { cmakeGetPicoVar, configureCmakeNinja } from "../utils/cmakeUtil.mjs";

export async function cmakeSetupAutoConfigure(
  workspaceFolder: WorkspaceFolder,
  ui: UI
): Promise<void> {
  await configureCmakeNinja(workspaceFolder.uri);

  const ws = workspaceFolder.uri.fsPath;
  const cMakeCachePath = join(ws, "build", "CMakeCache.txt");
  const newBuildType = cmakeGetPicoVar(cMakeCachePath, "CMAKE_BUILD_TYPE");
  ui.updateBuildType(newBuildType ?? "unknown");

  workspace.onDidChangeTextDocument(event => {
    if (basename(event.document.fileName) === "CMakeLists.txt") {
      Logger.debug(
        LoggerSource.extension,
        "File changed:",
        event.document.fileName
      );
    }
  });
}
