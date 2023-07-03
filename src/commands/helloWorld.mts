import { window } from "vscode";
import { Command } from "./command.mjs";

export default class HelloWorldCommand extends Command {
  constructor() {
    super("helloWorld");
  }

  async execute(): Promise<void> {
    await window.showInformationMessage("Hello World from raspberry-pi-pico!");
  }
}
