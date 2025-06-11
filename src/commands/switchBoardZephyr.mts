import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { join as joinPosix } from "path/posix";
import { commands, ProgressLocation, window, workspace, Uri } from "vscode";

import { Command } from "./command.mjs";
import { buildZephyrWorkspacePath } from "../utils/download.mjs";

export default class SwitchZephyrBoardCommand extends Command {
  public static readonly id = "switchBoardZephyr";

  constructor() {
    super(SwitchZephyrBoardCommand.id);
  }

  async execute(): Promise<void> {
    const workspaceFolder = workspace.workspaceFolders?.[0];

    // check it has a CMakeLists.txt
    if (
      workspaceFolder === undefined ||
      !existsSync(join(workspaceFolder.uri.fsPath, "CMakeLists.txt"))
    ) {
      return;
    }

    // check if pico_zephyr is in CMakeLists.txt - Then update using Zephyr tooling
    if (
      readFileSync(join(workspaceFolder.uri.fsPath, "CMakeLists.txt"))
        .toString("utf-8")
        .includes("pico_zephyr")
    ) {
      // Get tasks.json, find the task called "Compile Project"
      // then edit the build arguments
      const taskJsonFile = joinPosix(
        workspaceFolder.uri.fsPath,
        ".vscode",
        "tasks.json"
      );

      if (!existsSync(taskJsonFile)) {
        window.showInformationMessage(
          "Creating tasks.json file for Zephyr project"
        );

        const zephyrTasksJsonFile = joinPosix(
          buildZephyrWorkspacePath(),
          "pico-zephyr",
          "app",
          ".vscode",
          "tasks.json"
        );

        await workspace.fs.copy(
          Uri.file(zephyrTasksJsonFile),
          Uri.file(taskJsonFile)
        );
      }

      // Now that we know there is a tasks.json file, we can read it
      // and set the board in the "Compile Project" task
      const jsonString = (
        await workspace.fs.readFile(Uri.file(taskJsonFile))
      ).toString();
      const tasksJson: any = JSON.parse(jsonString);

      // Check it has a tasks object with
      if (tasksJson.tasks === undefined || !Array.isArray(tasksJson.tasks)) {
        window.showErrorMessage(
          "Could not find task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
        );

        return;
      }

      let i;
      for (i = 0; i < (tasksJson.tasks as any[]).length; i++) {
        if (
          tasksJson.tasks[i].label !== undefined &&
          tasksJson.tasks[i].label === "Compile Project"
        ) {
          window.showErrorMessage("Compile Project task found");

          let args: string[] = tasksJson.tasks[i].args;

          // Get the args array
          if (args !== undefined && Array.isArray(args)) {
            const buildIndex = args.findIndex(element => element === "-b");
            if (buildIndex >= 0 && buildIndex < args.length - 1) {
              args[buildIndex + 1] = "New Board!!!";
            }
          }
        }
      }

      // Write JSON back into file
      const newTasksJsonString = JSON.stringify(tasksJson, null, 4);
      await workspace.fs.writeFile(
        Uri.file(taskJsonFile),
        Buffer.from(newTasksJsonString)
      );

      window.showInformationMessage("Board Updated");
    }
  }
}
