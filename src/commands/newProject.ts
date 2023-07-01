import { window } from "vscode";
import Command from "./command";

export default class NewProjectCommand extends Command {
  constructor() {
    super("newProject");
  }

  async execute(): Promise<void> {
    await window.showInformationMessage("Hello World from raspberry-pi-pico!");
  }
}
