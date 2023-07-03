import { exec } from "child_process";
import { workspace, type Uri, window, ProgressLocation } from "vscode";

export async function configureCmakeNinja(folder: Uri): Promise<boolean> {
  try {
    // check if CMakeLists.txt exists in the root folder
    await workspace.fs.stat(
      folder.with({ path: folder.path + "/CMakeLists.txt" })
    );

    void window.withProgress(
      { location: ProgressLocation.Notification, cancellable: true },
      // eslint-disable-next-line @typescript-eslint/require-await
      async (progress, token) => {
        // TODO: analyze command result
        // TODO: option for the user to choose the generator
        const child = exec(`cmake -G Ninja -B ./build ${folder.fsPath}`, {
          cwd: folder.fsPath,
        });

        //child.stdout?.on("data", data => {});
        child.on("close", () => {
          progress.report({ increment: 100 });
        });
        child.on("exit", () => {
          progress.report({ increment: 100 });
        });

        token.onCancellationRequested(() => {
          child.kill();
        });
      }
    );

    return true;
  } catch (e) {
    return false;
  }
}
