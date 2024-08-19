import { execSync } from "child_process";
import Logger from "../logger.mjs";
import { mkdir } from "fs";
import { rimrafSync } from "rimraf";
import { dirname, join } from "path";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ensureDir(dirPath: string): Promise<void> {
  return new Promise(resolve => {
    mkdir(dirPath, { recursive: true }, () => {
      resolve();
    });
  });
}

function removeDir(dirPath: string): Promise<void> {
  return new Promise(resolve => {
    rimrafSync(dirPath);
    resolve();
  });
}

/**
 * This class is responsible for extracting the Python framework from the macOS installer pkg.
 *
 * Currently only support Apple Silicon (arm64) architecture.
 */
export default class MacOSPythonPkgExtractor {
  private _logger: Logger;
  private pkgFilePath: string;
  private targetDirectory: string;

  constructor(pkgFilePath: string, targetDirectory: string) {
    this._logger = new Logger("MacOSPythonPkgExtractor");
    this.pkgFilePath = pkgFilePath;
    this.targetDirectory = targetDirectory;
  }

  public async extractPkg(): Promise<boolean> {
    // Create a temporary directory for extraction
    const tempDir = join(dirname(this.pkgFilePath), "temp-extract");
    // required by pkgutil to not already exist in fs
    //await ensureDir(tempDir);

    let exceptionOccurred = false;
    try {
      // Step 1: Extract the pkg file using pkgutil
      const extractCmd = `pkgutil --expand "${this.pkgFilePath}" "${tempDir}"`;
      this.runCommand(extractCmd);

      // Step 2: Extract the payload using tar
      const payloadPath = join(tempDir, "Python_Framework.pkg", "Payload");
      const tarCmd = `tar -xvf "${payloadPath}" -C "${this.targetDirectory}"`;
      this.runCommand(tarCmd);
    } catch {
      exceptionOccurred = true;
    } finally {
      // Clean up: Remove the temporary directory
      await removeDir(tempDir);
    }

    if (exceptionOccurred) {
      this._logger.error("Failed to extract the Python framework");

      return false;
    }

    return true;
  }

  private runCommand(command: string): void {
    try {
      execSync(command);
    } catch (error) {
      const mesage = error instanceof Error ? error.message : (error as string);
      this._logger.error(
        `Error executing command: ${command} Error: ${mesage}`
      );
      throw error;
    }
  }
}
