import {
  commands,
  tasks,
  Uri,
  window,
  workspace,
  type WorkspaceFolder,
} from "vscode";
import { EventEmitter } from "events";
import { CommandWithResult } from "./command.mjs";
import Logger, { LoggerSource } from "../logger.mjs";
import Settings, { SettingsKey } from "../settings.mjs";
import State from "../state.mjs";
import { cmakeToolsForcePicoKit } from "../utils/cmakeToolsUtil.mjs";
import { COMPILE_PROJECT } from "./cmdIds.mjs";
import { TextDecoder } from "util";

export default class CompileProjectCommand extends CommandWithResult<boolean> {
  constructor() {
    super(COMPILE_PROJECT);
  }

  private async zephyrCheckWifiPrerequisites(
    workspaceFolders: readonly WorkspaceFolder[]
  ): Promise<void> {
    // check if the project root gitingore contains wifi_info.h
    console.assert(workspaceFolders.length > 0);
    const gitignoreUri = Uri.joinPath(workspaceFolders[0].uri, ".gitignore");

    try {
      await workspace.fs.stat(gitignoreUri);
      const gitignoreContent = await workspace.fs.readFile(gitignoreUri);
      const decoder = new TextDecoder();
      const gitignoreText = decoder.decode(gitignoreContent);
      if (gitignoreText.includes("\nwifi_info.h\n")) {
        // check if wifi_info.h exists
        const wifiInfoUri = Uri.joinPath(
          workspaceFolders[0].uri,
          "src",
          "wifi_info.h"
        );

        try {
          await workspace.fs.stat(wifiInfoUri);

          return;
        } catch {
          void window.showWarningMessage(
            "wifi_info.h is listed in .gitignore but does not exist. " +
              "Make sure to create it with your WiFi credentials " +
              "for the build to succeed."
          );

          return;
        }
      }
    } catch {
      // do nothing
    }
  }

  async execute(): Promise<boolean> {
    const isRustProject = State.getInstance().isRustProject;
    const isZephyrProject = State.getInstance().isZephyrProject;
    const workspaceFolders = workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
      void window.showErrorMessage("No workspace folder found.");

      return false;
    }
    let compileCommandsPreExistance = false;

    if (isZephyrProject) {
      await this.zephyrCheckWifiPrerequisites(workspaceFolders);

      try {
        await workspace.fs.stat(
          Uri.joinPath(
            workspaceFolders[0].uri,
            "build",
            "compile_commands.json"
          )
        );
        compileCommandsPreExistance = true;
      } catch {
        compileCommandsPreExistance = false;
      }
    }

    // Get the task with the specified name
    const task = (await tasks.fetchTasks()).find(
      task =>
        task.name ===
        (isRustProject ? "Build + Generate SBOM (release)" : "Compile Project")
    );

    const settings = Settings.getInstance();
    if (
      !isRustProject &&
      settings !== undefined &&
      settings.getBoolean(SettingsKey.useCmakeTools)
    ) {
      // Ensure the Pico kit is selected
      await cmakeToolsForcePicoKit();

      // Compile with CMake Tools
      await commands.executeCommand("cmake.launchTargetPath");

      return true;
    }

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
      Logger.debug(LoggerSource.compileProject,
        "Task 'Compile Project' completed with code " + code.toString()
      );

      if (isZephyrProject && !compileCommandsPreExistance) {
        const reload = await window.showInformationMessage(
          "Project compiled. Reload window for IntelliSense to update.",
          "Reload",
          "Later"
        );

        if (reload === "Reload") {
          // TODO: mark as intentional reload so extension.mts doesn't run setupZephyr again
          await commands.executeCommand("workbench.action.reloadWindow");
        }
      }

      return code === 0;
    } else {
      // Task not found
      Logger.error(LoggerSource.compileProject,
        "Task 'Compile Project' not found."
      );
      void window.showErrorMessage("Task 'Compile Project' not found.");

      return false;
    }
  }
}
