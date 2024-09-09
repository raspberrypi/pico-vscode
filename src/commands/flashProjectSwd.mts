import { CommandWithResult } from "./command.mjs";
import Logger from "../logger.mjs";
import { tasks, window } from "vscode";
import { EventEmitter } from "stream";

export default class FlashProjectSWDCommand extends CommandWithResult<boolean> {
  private _logger: Logger = new Logger("FlashProjectSWDCommand");

  public static readonly id = "flashProject";

  constructor() {
    super(FlashProjectSWDCommand.id);
  }

  async execute(): Promise<boolean> {
    this._logger.info("Executing flash task...");

    // Get the task with the specified name
    const task = (await tasks.fetchTasks()).find(task => task.name === "Flash");

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

      const codePromise = new Promise<number>(resolve => {
        emitter.on("terminated", code => {
          if (typeof code === "number") {
            resolve(code);
          } else {
            resolve(-1);
          }
        });
      });

      let code = -1;
      try {
        await tasks.executeTask(task);

        code = await codePromise;
      } finally {
        // dispose of callbacks
        end.dispose();
        end2.dispose();
      }

      return code === 0;
    } else {
      // Task not found
      this._logger.error("Task 'Flash' not found.");
      void window.showErrorMessage("Task 'Flash' not found.");

      return false;
    }
  }
}
