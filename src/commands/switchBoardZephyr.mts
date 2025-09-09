import { existsSync, type PathOrFileDescriptor, readFileSync } from "fs";
import { join } from "path";
import { join as joinPosix } from "path/posix";
import { window, workspace, Uri } from "vscode";

import { Command } from "./command.mjs";
import type UI from "../ui.mjs";
import { buildZephyrWorkspacePath } from "../utils/download.mjs";

enum BoardNames {
  pico = "Pico",
  picoW = "Pico W",
  pico2 = "Pico 2",
  pico2W = "Pico 2W",
}

interface TasksJson {
  tasks: Array<{
    label: string;
    args: string[];
  }>;
}

export function findZephyrBoardInTasksJson(
  tasksJsonFilePath: PathOrFileDescriptor
): string | undefined {
  const tasksJson = JSON.parse(
    readFileSync(tasksJsonFilePath).toString("utf-8")
  ) as TasksJson;

  // Check it has a tasks object with
  if (tasksJson.tasks === undefined || !Array.isArray(tasksJson.tasks)) {
    window.showErrorMessage(
      "Could not find task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
    );

    return;
  }

  // Find the index of the task called "Compile Project"
  const compileIndex = tasksJson.tasks.findIndex(
    element =>
      element.label !== undefined && element.label === "Compile Project"
  );

  if (compileIndex < 0) {
    window.showErrorMessage(
      "Could not find Compile Project task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
    );

    return;
  }

  const args: string[] = tasksJson.tasks[compileIndex].args;

  if (args === undefined || !Array.isArray(args)) {
    window.showErrorMessage(
      "Could not find args within Compile Project task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
    );

    return;
  }

  // Get the args array
  const buildIndex = args.findIndex(element => element === "-b");
  let board;
  if (buildIndex >= 0 && buildIndex < args.length - 1) {
    // Update UI with board description
    board = args[buildIndex + 1];
  } else {
    window.showErrorMessage(
      "Could not find board arg within Compile Project task to modify board\
           on. Please see the Pico Zephyr examples for a reference."
    );

    return;
  }

  return board;
}

export default class SwitchZephyrBoardCommand extends Command {
  public static readonly id = "switchBoardZephyr";

  constructor(private readonly _ui: UI) {
    super(SwitchZephyrBoardCommand.id);
  }

  private stringToBoard(e: string): string {
    if (e === (BoardNames.pico as string)) {
      return "rpi_pico";
    } else if (e === (BoardNames.picoW as string)) {
      return "rpi_pico/rp2040/w";
    } else if (e === (BoardNames.pico2 as string)) {
      return "rpi_pico2/rp2350a/m33";
    } else if (e === (BoardNames.pico2W as string)) {
      return "rpi_pico2/rp2350a/m33/w";
    } else {
      throw new Error(`Unknown Board Type: ${e}`);
    }
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

      // Get the board name
      const quickPickItems = [
        BoardNames.pico,
        BoardNames.picoW,
        BoardNames.pico2,
        BoardNames.pico2W,
      ];

      const selectedBoard = await window.showQuickPick(quickPickItems, {
        placeHolder: "Select Board",
      });

      if (selectedBoard === undefined) {
        window.showErrorMessage(
          "Error getting board definition from quck pick.\
          Please try again."
        );

        return;
      }

      const boardArg = this.stringToBoard(selectedBoard);

      // Now that we know there is a tasks.json file, we can read it
      // and set the board in the "Compile Project" task
      const jsonString = (
        await workspace.fs.readFile(Uri.file(taskJsonFile))
      ).toString();
      const tasksJson = JSON.parse(jsonString) as TasksJson;

      // Check it has a tasks object with
      if (tasksJson.tasks === undefined || !Array.isArray(tasksJson.tasks)) {
        window.showErrorMessage(
          "Could not find task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
        );

        return;
      }

      // Find the index of the task called "Compile Project"
      const compileIndex = tasksJson.tasks.findIndex(
        element =>
          element.label !== undefined && element.label === "Compile Project"
      );

      if (compileIndex < 0) {
        window.showErrorMessage(
          "Could not find Compile Project task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
        );

        return;
      }

      const args: string[] = tasksJson.tasks[compileIndex].args;

      if (args === undefined || !Array.isArray(args)) {
        window.showErrorMessage(
          "Could not find args within Compile Project task to modify board on.\
          Please see the Pico Zephyr examples for a reference."
        );

        return;
      }

      // Get the args array
      const buildIndex = args.findIndex(element => element === "-b");
      if (buildIndex >= 0 && buildIndex < args.length - 1) {
        args[buildIndex + 1] = boardArg;
      } else {
        window.showErrorMessage(
          "Could not find board arg within Compile Project task to modify board\
           on. Please see the Pico Zephyr examples for a reference."
        );

        return;
      }

      // Write JSON back into file
      const newTasksJsonString = JSON.stringify(tasksJson, null, 4);
      await workspace.fs.writeFile(
        Uri.file(taskJsonFile),
        Buffer.from(newTasksJsonString)
      );

      this._ui.updateBoard(selectedBoard);

      window.showInformationMessage(`Board Updated to ${selectedBoard}`);
    }
  }
}
