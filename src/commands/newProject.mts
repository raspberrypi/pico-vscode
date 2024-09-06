import { CommandWithArgs } from "./command.mjs";
import Logger from "../logger.mjs";
import { window, type Uri } from "vscode";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";
// eslint-disable-next-line max-len
import { NewMicroPythonProjectPanel } from "../webview/newMicroPythonProjectPanel.mjs";

/**
 * Enum for the language of the project.
 * Can be used to specify the language of the project
 * in the `NewProjectCommand` class.
 */
export enum ProjectLang {
  cCpp = 1,
  micropython = 2,
}

export default class NewProjectCommand extends CommandWithArgs {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  private readonly _extensionUri: Uri;
  private static readonly micropythonOption = "MicroPython";
  private static readonly cCppOption = "C/C++";

  public static readonly id = "newProject";

  constructor(extensionUri: Uri) {
    super(NewProjectCommand.id);

    this._extensionUri = extensionUri;
  }

  private preSelectedTypeToStr(preSelectedType?: number): string | undefined {
    return preSelectedType === ProjectLang.cCpp
      ? NewProjectCommand.cCppOption
      : preSelectedType === ProjectLang.micropython
      ? NewProjectCommand.micropythonOption
      : undefined;
  }

  async execute(preSelectedType?: number): Promise<void> {
    // ask the user what language to use
    const lang =
      this.preSelectedTypeToStr(preSelectedType) ??
      (await window.showQuickPick(
        [NewProjectCommand.cCppOption, NewProjectCommand.micropythonOption],
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
    } else {
      // show webview where the process of creating a new project is continued
      NewProjectPanel.createOrShow(this._extensionUri);
    }
  }
}
