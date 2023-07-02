import { commands, type Disposable } from "vscode";

const extensionId = "raspberry-pi-pico";

export default abstract class Command {
  private readonly commandId: string;

  protected constructor(commandId: string) {
    this.commandId = commandId;
  }

  register(): Disposable {
    return commands.registerCommand(
      extensionId + "." + this.commandId,
      this.execute.bind(this)
    );
  }

  abstract execute(): Promise<void>;
}
