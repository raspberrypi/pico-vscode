import { homedir } from "os";
import { join as joinPosix } from "path/posix";
import { workspace, Uri } from "vscode";

import { CommandWithResult } from "../commands/command.mjs";
import { buildZephyrWorkspacePath } from "./download.mjs";
import Logger from "../logger.mjs";

export class NewZephyrProjectCommand extends CommandWithResult<
  string | undefined
> {
  private running: boolean = false;

  public static readonly id = "newZephyrProject";

  private readonly _logger: Logger = new Logger("newZephyrProject");

  constructor() {
    super(NewZephyrProjectCommand.id);
  }

  async execute(): Promise<string | undefined> {
    if (this.running) {
      return undefined;
    }
    this.running = true;

    this._logger.info("Generating new Zephyr Project");

    // Create a new directory to put the project in
    const homeDirectory: string = homedir();
    const newProjectDir = joinPosix(
      homeDirectory,
      "zephyr_test",
      "zephyr_project"
    );
    await workspace.fs.createDirectory(Uri.file(newProjectDir));

    // Copy the Zephyr App into the new directory
    const zephyrAppDir = joinPosix(
      buildZephyrWorkspacePath(),
      "pico-zephyr",
      "app"
    );
    await workspace.fs.copy(Uri.file(zephyrAppDir), Uri.file(newProjectDir), {
      overwrite: true,
    });

    const result = true;

    if (result === null || !result) {
      this.running = false;

      return undefined;
    }

    this._logger.info(`Zephyr Project generated at ${newProjectDir}`);

    this.running = false;

    return "hello";
  }
}
