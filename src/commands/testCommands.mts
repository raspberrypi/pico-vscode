import { CommandWithResultAndArgs } from "./command.mjs";
import { Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";
import { workspace, tasks } from "vscode";
import Logger from "../logger.mjs";
import { EventEmitter } from "events";

/* ------------------------------ Main command ------------------------------ */

export default class TestCreateProjectCommand
    extends CommandWithResultAndArgs<string> {
  constructor(private readonly _extensionUri: Uri) {
    super("testCreateProject");
  }

  async execute(
    example: string,
    board: string,
    cmakeTools: boolean = false
  ): Promise<string> {
    const projectUri = workspace.workspaceFolders?.[0]?.uri;
    if (!projectUri) {
      return "No project URI";
    }
    Logger.log(`Project URI: ${projectUri.toString()}`);
    const fspath = projectUri.fsPath;

    const projectSubdir = `${cmakeTools ? "cmakeTools" : "default"}/${board}`;
    const fspathUri = Uri.file(fspath + `/projects/${projectSubdir}`);
    Logger.log(`fspath URI: ${fspathUri.toString()}`);

    NewProjectPanel._noOpenFolder = true;

    NewProjectPanel.createOrShow(this._extensionUri, false, true, fspathUri);
    while (!NewProjectPanel.testIfLoaded()) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    await NewProjectPanel.sendTestMessage({
      command: "testCreateProject",
      value: {
        name: example,
        board: board,
        cmakeTools: cmakeTools,
      },
    });

    while (!NewProjectPanel.testIfCreated()) {
      Logger.log("Waiting for project to be created");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    Logger.log("Project created");

    return "Project created";
  }
}


export class TestRunTaskCommand extends CommandWithResultAndArgs<string> {
  constructor() {
    super("testRunTask");
  }

  async execute(taskName: string): Promise<string> {
    // Get the task with the specified name
    const task = (await tasks.fetchTasks()).find(
      task =>
        task.name === taskName
    );

    if (task) {
      // Execute the task
      const emitter = new EventEmitter();

      // add callbacks for task completion
      const end = tasks.onDidEndTaskProcess(e => {
        if (e.execution.task === task) {
          emitter.emit(
            "terminated",
            e.exitCode === undefined ? -1 : e.exitCode
          );
        }
      });
      const end2 = tasks.onDidEndTask(e => {
        if (e.execution.task === task) {
          emitter.emit("terminated", -1);
        }
      });

      await tasks.executeTask(task);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const code = await new Promise<number>((resolve, reject) => {
        emitter.on("terminated", code => {
          if (typeof code === "number") {
            resolve(code);
          } else {
            resolve(-1);
          }
        });
      });

      // dispose of callbacks
      end.dispose();
      end2.dispose();
      Logger.log(
        "Task '${taskName}' completed with code " + code.toString()
      );

      return code === 0 ? "Task completed" : "Task failed";
    } else {
      // Task not found
      Logger.log("Task '${taskName}' not found.");

      return "Task not found";
    }
  }
}