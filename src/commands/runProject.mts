import { tasks, window } from "vscode";
import { EventEmitter } from "events";
import { CommandWithResult } from "./command.mjs";
import Logger from "../logger.mjs";

export default class RunProjectCommand extends CommandWithResult<boolean> {
  private _logger: Logger = new Logger("RunProjectCommand");

  public static readonly id = "runProject";

  constructor() {
    super(RunProjectCommand.id);
  }

  async execute(): Promise<boolean> {
    // Get the task with the specified name
    const task = (await tasks.fetchTasks()).find(
      task => task.name === "Run Project"
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
      this._logger.debug(
        "Task 'Run Project' completed with code " + code.toString()
      );

      return code === 0;
    } else {
      // Task not found
      this._logger.error("Task 'Run Project' not found.");
      void window.showErrorMessage("Task 'Run Project' not found.");

      return false;
    }
  }
}
