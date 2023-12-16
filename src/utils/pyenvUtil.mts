import { homedir } from "os";
import { cloneRepository } from "./gitUtil.mjs";
import { PYENV_REPOSITORY_URL } from "./githubREST.mjs";
import { join as joinPosix } from "path/posix";
import { exec } from "child_process";
import { buildPython3Path } from "./download.mjs";
import { HOME_VAR } from "../settings.mjs";
import { existsSync, mkdirSync, symlinkSync } from "fs";
import { join } from "path";

export function buildPyEnvPath(): string {
  // TODO: maybe replace . with _
  return joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "pyenv");
}

/**
 * Download pyenv and install it.
 */
export async function setupPyenv(): Promise<boolean> {
  const targetDirectory = buildPyEnvPath();
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

export async function pyenvInstallPython(
  version: string
): Promise<string | null> {
  const targetDirectory = buildPyEnvPath();
  const binDirectory = joinPosix(targetDirectory, "bin");
  const command = `${binDirectory}/pyenv install ${version}`;

  const customEnv = { ...process.env };
  customEnv["PYENV_ROOT"] = targetDirectory;
  customEnv[
    process.platform === "win32" ? "Path" : "PATH"
  ] = `${binDirectory};${customEnv["PATH"]}`;

  const settingsTarget =
    `${HOME_VAR}/.pico-sdk` + `/python/${version}/python.exe`;
  const pythonVersionPath = buildPython3Path(version);

  if (existsSync(pythonVersionPath)) {
    return settingsTarget;
  }

  return new Promise(resolve => {
    exec(
      command,
      { env: customEnv, cwd: binDirectory },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null);
        }

        const versionFolder = joinPosix(targetDirectory, "versions", version);
        const pyBin = joinPosix(versionFolder, "bin");
        mkdirSync(pythonVersionPath, { recursive: true });
        symlinkSync(
          joinPosix(pyBin, "python3"),
          joinPosix(pythonVersionPath, "python.exe")
        );
        symlinkSync(
          joinPosix(pyBin, "python3"),
          joinPosix(pythonVersionPath, "python3exe")
        );

        resolve(settingsTarget);
      }
    );
  });
}
