import { commands, window, ProgressLocation } from "vscode";


export async function cmakeToolsForcePicoKit(): Promise<void> {
  let cmakeToolsKit = await commands.executeCommand(
    "cmake.buildKit"
  );
  if (cmakeToolsKit === "Pico") {
    return;
  }

  await window.withProgress({
    location: ProgressLocation.Notification,
    title: "Select the Pico kit in the dialog at the top of the window",
    cancellable: false,
  }, async progress => {
    let i = 0;
    while (cmakeToolsKit !== "Pico") {
      if (i >= 2) {
        const result = await window.showErrorMessage(
          "You did not select the Pico kit - " +
          "you must select the Pico kit in the dialog, " +
          "else this extension will not work",
          "Try again",
          "Cancel"
        );

        if (result === "Try again") {
          i = 0;
          continue;
        }

        progress.report({increment: 100});

        return;
      }
      await commands.executeCommand("cmake.selectKit");
      cmakeToolsKit = await commands.executeCommand(
        "cmake.buildKit"
      );
      i++;
    }
    progress.report({increment: 100});

    return;
  });
}
