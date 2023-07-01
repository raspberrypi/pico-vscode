import type { ExtensionContext } from "vscode";
import type Command from "./commands/command";
import NewProjectCommand from "./commands/newProject";

const COMMANDS: Command[] = [new NewProjectCommand()];

export function activate(context: ExtensionContext): void {
  console.log('Congratulations, extension "raspberry-pi-pico" is now active!');

  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
