import { FileSystemError, Uri, workspace } from "vscode";

export async function vsExists(path: string): Promise<boolean> {
  try {
    await workspace.fs.stat(Uri.file(path));

    return true;
  } catch (err) {
    if (err instanceof FileSystemError && err.code === "FileNotFound") {
      return false;
    }
    // rethrow unexpected errors
    throw err;
  }
}
