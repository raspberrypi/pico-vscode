import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  console.log(
    'Congratulations, your extension "raspberry-pi-pico" is now active!'
  );

  const disposable = vscode.commands.registerCommand(
    "raspberry-pi-pico.newProject",
    () => {
      void vscode.window.showInformationMessage(
        "Hello World from raspberry-pi-pico!"
      );
    }
  );

  context.subscriptions.push(disposable);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
