import { CommandWithArgs } from "./command.mjs";
import { window, type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";
// eslint-disable-next-line max-len
import { NewMicroPythonProjectPanel } from "../webview/newMicroPythonProjectPanel.mjs";
import { NewRustProjectPanel } from "../webview/newRustProjectPanel.mjs";
import { NewZephyrProjectPanel } from "../webview/newZephyrProjectPanel.mjs";
import { NEW_PROJECT } from "./cmdIds.mjs";
import { ProjectLang } from "../models/projectLang.mjs";

export default class NewProjectCommand extends CommandWithArgs {
  private readonly _extensionUri: Uri;
  private static readonly micropythonOption = "MicroPython";
  private static readonly cCppOption = "C/C++";
  private static readonly rustOption = "Rust (experimental)";
  private static readonly zephyrOption = "Zephyr";

  constructor(extensionUri: Uri) {
    super(NEW_PROJECT);

    this._extensionUri = extensionUri;
  }

  private preSelectedTypeToStr(preSelectedType?: number): string | undefined {
    return preSelectedType === ProjectLang.cCpp
      ? NewProjectCommand.cCppOption
      : preSelectedType === ProjectLang.micropython
      ? NewProjectCommand.micropythonOption
      : preSelectedType === ProjectLang.rust
      ? NewProjectCommand.rustOption
      : preSelectedType === ProjectLang.zephyr
      ? NewProjectCommand.zephyrOption
      : undefined;
  }

  async execute(preSelectedType?: number): Promise<void> {
    // ask the user what language to use
    const lang =
      this.preSelectedTypeToStr(preSelectedType) ??
      (await window.showQuickPick(
        [
          NewProjectCommand.cCppOption,
          NewProjectCommand.micropythonOption,
          NewProjectCommand.rustOption,
          NewProjectCommand.zephyrOption,
        ],
        {
          placeHolder: "Select which language to use for your new project",
          canPickMany: false,
          ignoreFocusOut: false,
          title: "New Pico Project",
        }
      ));

    if (lang === undefined) {
      return;
    }

    if (lang === NewProjectCommand.micropythonOption) {
      // create a new project with MicroPython
      NewMicroPythonProjectPanel.createOrShow(this._extensionUri);
    } else if (lang === NewProjectCommand.rustOption) {
      // create a new project with Rust
      NewRustProjectPanel.createOrShow(this._extensionUri);
    } else if (lang === NewProjectCommand.zephyrOption) {
      // create a new project with MicroPython
      NewZephyrProjectPanel.createOrShow(this._extensionUri);
    } else {
      // show webview where the process of creating a new project is continued
      NewProjectPanel.createOrShow(this._extensionUri);
    }
  }
}
