import { commands, tasks, window } from "vscode";
import { EventEmitter } from 'events';
import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import Settings, { SettingsKey } from "../settings.mjs";

export default class CompileProjectCommand extends Command {
  private _logger: Logger = new Logger("CompileProjectCommand");

  public static readonly id = "compileProject";

  constructor() {
    super(CompileProjectCommand.id);
  }

  async execute(): Promise<void> {
    // Get the task with the specified name
    const task = (await tasks.fetchTasks()).find(task => () => {
      console.log(`[TASK] ${task.name}`);

      return task.name === "Compile Project";
    });

    const settings = Settings.getInstance();
    if (
      settings !== undefined && settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      // Compile with CMake Tools
      await commands.executeCommand(
        "cmake.launchTargetPath"
      );

      return;
    }

    if (task) {
      // Execute the task
      var emitter = new EventEmitter();

      // add callbacks for task completion
      var end = tasks.onDidEndTaskProcess(e => {
        emitter.emit("terminated", e.exitCode);
      });
      var end2 = tasks.onDidEndTask(e => {
        emitter.emit("terminated", -1);
      });

      await tasks.executeTask(task);
      var code = await new Promise<Number>((resolve, reject) => {
        emitter.on("terminated", code => resolve(code));
      });

      // dispose of callbacks
      end.dispose();
      end2.dispose();
      this._logger.debug("Task 'Compile Project' completed with code " + code);
    } else {
      // Task not found
      this._logger.error("Task 'Compile Project' not found.");
      void window.showErrorMessage("Task 'Compile Project' not found.");
    }

    return;
  }
}
