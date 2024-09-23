import { homedir } from "os";
import { cloneRepository } from "./gitUtil.mjs";
import { PYENV_REPOSITORY_URL } from "./githubREST.mjs";
import { join as joinPosix } from "path/posix";
import { exec } from "child_process";
import { buildPython3Path } from "./download.mjs";
import { HOME_VAR } from "../settings.mjs";
import { existsSync, mkdirSync, symlinkSync } from "fs";
import { CURRENT_PYTHON_VERSION } from "./sharedConstants.mjs";

export function buildPyenvPath(): string {
  // TODO: maybe replace . with _
  return joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "pyenv");
}

/**
 * Download pyenv and install it.
 */
export async function setupPyenv(): Promise<boolean> {
  const targetDirectory = buildPyenvPath();
  // TODO: load git executable
  const result = await cloneRepository(
    PYENV_REPOSITORY_URL,
    "master",
    targetDirectory
  );

  if (!result) {
    return false;
  }

  return true;
}

export async function pyenvInstallPython(): Promise<string | undefined> {
  const targetDirectory = buildPyenvPath();
  const binDirectory = joinPosix(targetDirectory, "bin");
  const command = `${binDirectory}/pyenv install -s ${CURRENT_PYTHON_VERSION}`;

  const customEnv = { ...process.env };
  customEnv["PYENV_ROOT"] = targetDirectory;
  customEnv[process.platform === "win32" ? "Path" : "PATH"] = `${binDirectory}${
    process.platform === "win32" ? ";" : ":"
  }${customEnv[process.platform === "win32" ? "Path" : "PATH"]}`;

  const settingsTarget =
    `${HOME_VAR}/.pico-sdk/python` + `/${CURRENT_PYTHON_VERSION}/python.exe`;
  const pythonVersionPath = buildPython3Path(CURRENT_PYTHON_VERSION);

  if (existsSync(pythonVersionPath)) {
    return settingsTarget;
  }

  return new Promise(resolve => {
    exec(command, { env: customEnv, cwd: binDirectory }, error => {
      if (error) {
        resolve(undefined);
      }

      const versionFolder = joinPosix(
        targetDirectory,
        "versions",
        CURRENT_PYTHON_VERSION
      );
      const pyBin = joinPosix(versionFolder, "bin");
      mkdirSync(pythonVersionPath, { recursive: true });
      symlinkSync(
        joinPosix(pyBin, "python3"),
        joinPosix(pythonVersionPath, "python.exe")
      );
      symlinkSync(
        joinPosix(pyBin, "python3"),
        joinPosix(pythonVersionPath, "python3.exe")
      );

      resolve(settingsTarget);
    });
  });
}
