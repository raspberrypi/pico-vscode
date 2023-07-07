import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { existsSync, appendFileSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { v4 as uuidv4 } from "uuid";
import Logger from "../logger.mjs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function base62Encode(uuid: string): string {
  const uuidBytes = Buffer.from(uuid.replace(/-/g, ""), "hex");
  let value = BigInt("0x" + uuidBytes.toString("hex"));
  let encoded = "";

  while (value > 0n) {
    const remainder = Number(value % 62n);
    encoded = BASE62_ALPHABET[remainder] + encoded;
    value = value / 62n;
  }

  return encoded;
}

function getShellConfigFilePaths(): string[] {
  const zshPofilePath = `${homedir()}/.zprofile`;
  const bashProfilePath = `${homedir()}/.bash_profile`;
  const profilePath = `${homedir()}/.profile`;

  return [zshPofilePath, bashProfilePath, profilePath];
}

export function setGlobalEnvVar(variable: string, value: string): void {
  deleteGlobalEnvVar(variable);
  switch (process.platform) {
    case "darwin":
    case "linux": {
      const profiles = getShellConfigFilePaths();

      profiles.forEach(profile => {
        if (existsSync(profile)) {
          appendFileSync(profile, `\nexport ${variable}=${value}`, {
            encoding: "utf8",
          });
        }
      });
      break;
    }
    case "win32": {
      execSync(`setx ${variable} "${value}"`);
      break;
    }
  }
}

export function getGlobalEnvVar(variable: string): string | undefined {
  switch (process.platform) {
    case "darwin":
    case "linux": {
      const profiles = getShellConfigFilePaths();

      profiles.forEach(profile => {
        const profileContent = readFileSync(profile, "utf8");
        const regex = new RegExp(`export ${variable}=(.*)`);
        const match = profileContent.match(regex);

        if (match && match[1]) {
          return match[1];
        }
      });

      break;
    }
    case "win32": {
      try {
        const output = execSync(`echo %${variable}%`);

        return output.toString().trim();
      } catch (error) {
        return undefined;
      }
    }
  }

  return undefined;
}

export function deleteGlobalEnvVar(variable: string): void {
  switch (process.platform) {
    case "darwin":
    case "linux": {
      const profiles = getShellConfigFilePaths();

      profiles.forEach(profile => {
        if (existsSync(profile)) {
          execSync(
            `sed -i${
              process.platform === "darwin" ? " '' " : " "
            }'/export ${variable}=*/d' "${profile}"`
          );
          clearEmptyLinesAtEnd(profile, false);
        }
      });

      break;
    }
    case "win32": {
      execSync(`setx ${variable} ""`);
      break;
    }
  }
}

function getScriptsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "scripts");
}

export function deleteGlobalEnvVars(startingWith: string): void {
  switch (process.platform) {
    case "darwin":
    case "linux": {
      const profiles = getShellConfigFilePaths();

      profiles.forEach(profile => {
        if (existsSync(profile)) {
          execSync(
            `sed -i${
              process.platform === "darwin" ? " '' " : " "
            }'/export ${startingWith}.*=/d' "${profile}"`
          );
          clearEmptyLinesAtEnd(profile, true);
        }
      });

      break;
    }
    case "win32": {
      execSync(
        "powershell.exe -ExecutionPolicy Bypass " +
          `-File ${getScriptsRoot()}\\deleteAllGlobalEnvVars.ps1 ` +
          `-EnvVariablePrefix "${startingWith}"`
      );
      break;
    }
  }
}

export function clearEmptyLinesAtEnd(
  filePath: string,
  appendNl: boolean
): void {
  try {
    // Read the file
    const fileContent = readFileSync(filePath, "utf-8");

    // Split the file content into lines
    const lines = fileContent.split("\n");

    // Remove empty lines from the end until one empty line remains
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    // Join the lines back into a single string
    const updatedContent = lines.join("\n") + (appendNl ? "\n\n" : "");

    // Write the updated content back to the file
    writeFileSync(filePath, updatedContent, "utf-8");
  } catch (error) {
    Logger.log("An error occurred while cleaning the profile.");
  }
}

export function generateNewEnvVarSuffix(): string {
  return base62Encode(uuidv4({ random: _v4Bytes() }));
}

/**
 * Generate random bytes for uuidv4 as crypto.getRandomValues is not supported in vscode extensions
 *
 * @returns 16 random bytes
 */
function _v4Bytes(): Uint8Array {
  return new Uint8Array(randomBytes(16).buffer);
}
