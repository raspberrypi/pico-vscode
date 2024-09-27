import { homedir } from "os";
import {
  downloadAndInstallArchive,
  downloadAndReadFile,
  getScriptsRoot,
} from "./download.mjs";
import { getRustReleases } from "./githubREST.mjs";
import { join as joinPosix } from "path/posix";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "fs";
import Logger, { LoggerSource } from "../logger.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { env, ProgressLocation, Uri, window } from "vscode";
import type { Progress as GotProgress } from "got";
import { parse as parseToml } from "toml";
import { promisify } from "util";
import { exec, execSync } from "child_process";
import { dirname, join } from "path";
import { copyFile, mkdir, readdir, rm, stat } from "fs/promises";
import findPython from "./pythonHelper.mjs";

const STABLE_INDEX_DOWNLOAD_URL =
  "https://static.rust-lang.org/dist/channel-rust-stable.toml";

const execAsync = promisify(exec);

interface IndexToml {
  pkg?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "rust-std"?: {
      target?: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "thumbv6m-none-eabi"?: {
          available: boolean;
          // eslint-disable-next-line @typescript-eslint/naming-convention
          xz_url: string;
        };
      };
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "rust-analysis"?: {
      target?: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "thumbv6m-none-eabi"?: {
          available: boolean;
          // eslint-disable-next-line @typescript-eslint/naming-convention
          xz_url: string;
        };
      };
    };
  };
}

function computeDownloadLink(release: string): string {
  let platform = "";
  switch (process.platform) {
    case "darwin":
      platform = "apple-darwin";
      break;
    case "linux":
      platform = "unknown-linux-gnu";
      break;
    case "win32":
      // maybe gnu in the future and point to arm embedded toolchain
      platform = "pc-windows-msvc";
      break;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
  let arch = "";
  switch (process.arch) {
    case "x64":
      arch = "x86_64";
      break;
    case "arm64":
      arch = "aarch64";
      break;
    default:
      throw new Error(`Unsupported architecture: ${process.arch}`);
  }

  return (
    "https://static.rust-lang.org/dist" +
    `/rust-${release}-${arch}-${platform}.tar.xz`
  );
}

export async function cargoInstall(
  packageName: string,
  locked = false
): Promise<boolean> {
  const command = process.platform === "win32" ? "cargo.exe" : "cargo";
  try {
    const { stdout, stderr } = await execAsync(
      `${command} install ${locked ? "--locked " : ""}${packageName}`,
      {
        windowsHide: true,
      }
    );

    if (stderr) {
      if (
        stderr.toLowerCase().includes("already exists") ||
        stderr.toLowerCase().includes("to your path")
      ) {
        Logger.warn(
          LoggerSource.rustUtil,
          `Cargo package '${packageName}' is already installed ` +
            "or cargo bin not in PATH:",
          stderr
        );

        return true;
      }

      Logger.error(
        LoggerSource.rustUtil,
        `Failed to install cargo package '${packageName}': ${stderr}`
      );

      return false;
    }

    return true;
  } catch (error) {
    const msg = unknownErrorToString(error);
    if (
      msg.toLowerCase().includes("already exists") ||
      msg.toLowerCase().includes("to your path")
    ) {
      Logger.warn(
        LoggerSource.rustUtil,
        `Cargo package '${packageName}' is already installed ` +
          "or cargo bin not in PATH:",
        msg
      );

      return true;
    }
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to install cargo package '${packageName}': ${unknownErrorToString(
        error
      )}`
    );

    return false;
  }
}

export function calculateRequiredHostTriple(): string {
  const arch = process.arch;
  const platform = process.platform;
  let triple = "";
  if (platform === "win32" && arch === "x64") {
    triple = "x86_64-pc-windows-msvc";
  } else if (platform === "darwin") {
    if (arch === "x64") {
      triple = "x86_64-apple-darwin";
    } else {
      triple = "aarch64-apple-darwin";
    }
  } else if (platform === "linux") {
    if (arch === "x64") {
      triple = "x86_64-unknown-linux-gnu";
    } else if (arch === "arm64") {
      triple = "aarch64-unknown-linux-gnu";
    } else {
      throw new Error(`Unsupported architecture: ${arch}`);
    }
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return triple;
}

async function checkHostToolchainInstalled(): Promise<boolean> {
  try {
    const hostTriple = calculateRequiredHostTriple();
    const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
    const { stdout } = await execAsync(`${rustup} toolchain list`, {
      windowsHide: true,
    });

    return stdout.includes(hostTriple);
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to check for host toolchain: ${unknownErrorToString(error)}`
    );

    return false;
  }

  // or else check .rustup/toolchains/ for the host toolchain
}

export async function installHostToolchain(): Promise<boolean> {
  try {
    // this will automatically take care of having the correct
    // recommended host toolchain installed
    await execAsync("rustup show", {
      windowsHide: true,
    });

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to install host toolchain: ${unknownErrorToString(error)}`
    );

    return false;
  }
}

/**
 * Checks for all requirements except targets and cargo packages.
 *
 * (Cares about UI feedback)
 *
 * @returns {boolean} True if all requirements are met, false otherwise.
 */
export async function checkRustInstallation(): Promise<boolean> {
  let rustupOk = false;
  let rustcOk = false;
  let cargoOk = false;
  try {
    const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
    await execAsync(`${rustup} --version`, {
      windowsHide: true,
    });
    rustupOk = true;

    // check rustup toolchain
    const result = await checkHostToolchainInstalled();
    if (!result) {
      Logger.error(LoggerSource.rustUtil, "Host toolchain not installed");

      // TODO: make cancelable (Ctrl+C)
      const result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Installing Rust toolchain",
          cancellable: true,
        },
        async () => installHostToolchain()
      );

      if (!result) {
        void window.showErrorMessage(
          "Failed to install Rust toolchain. " +
            "Please install it manually with `rustup show`."
        );

        return false;
      }
    }

    const rustc = process.platform === "win32" ? "rustc.exe" : "rustc";
    await execAsync(`${rustc} --version`, {
      windowsHide: true,
    });
    rustcOk = true;

    const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
    await execAsync(`${cargo} --version`, {
      windowsHide: true,
    });
    cargoOk = true;

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Rust installation check failed: ${unknownErrorToString(error)}`
    );

    if (!rustupOk) {
      void window
        .showErrorMessage(
          "Rustup is not installed. Please install it manually.",
          "Install"
        )
        .then(result => {
          if (result) {
            env.openExternal(
              Uri.parse("https://www.rust-lang.org/tools/install", true)
            );
          }
        });
    } else if (!rustcOk) {
      void window.showErrorMessage(
        "Rustc is not installed. Please install it manually."
      );
    } else if (!cargoOk) {
      void window.showErrorMessage(
        "Cargo is not installed. Please install it manually."
      );
    } else {
      void window.showErrorMessage(
        "Failed to check Rust installation. Please check the logs."
      );
    }

    return false;
  }
}

export async function installEmbeddedRust(): Promise<boolean> {
  /*try {
    const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
    const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
    const commands = [
      `${rustup} target add thumbv6m-none-eabi`,
      `${cargo} install flip-link`,
      `${cargo} install --locked probe-rs-tools`,
      `${cargo} install --locked elf2uf2-rs`,
    ];

    return commands.every(command => {
      try {
        // TODO: test if throws on stderr
        execSync(command, {
          windowsHide: true,
        });

        return true;
      } catch (error) {
        Logger.error(
          LoggerSource.rustUtil,
          `Failed to execute command '${command}': ${unknownErrorToString(
            error
          )}`
        );

        return false;
      }
    });
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to install embedded Rust: ${unknownErrorToString(error)}`
    );

    return false;
  }*/

  // install target
  const target = "thumbv6m-none-eabi";
  try {
    const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
    await execAsync(`${rustup} target add ${target}`, {
      windowsHide: true,
    });
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to install target '${target}': ${unknownErrorToString(error)}`
    );

    void window.showErrorMessage(
      `Failed to install target '${target}'. Please check the logs.`
    );

    return false;
  }

  // install flip-link
  const flipLink = "flip-link";
  const result = await cargoInstall(flipLink, false);
  if (!result) {
    void window.showErrorMessage(
      `Failed to install cargo package '${flipLink}'.`,
      "Please check the logs."
    );

    return false;
  }

  // install probe-rs-tools
  const probeRsTools = "probe-rs-tools";
  const result2 = await cargoInstall(probeRsTools, true);
  if (!result2) {
    void window.showErrorMessage(
      `Failed to install cargo package '${probeRsTools}'.`,
      "Please check the logs."
    );

    return false;
  }

  // install elf2uf2-rs
  const elf2uf2Rs = "elf2uf2-rs";
  const result3 = await cargoInstall(elf2uf2Rs, true);
  if (!result3) {
    void window.showErrorMessage(
      `Failed to install cargo package '${elf2uf2Rs}'.`,
      "Please check the logs."
    );

    return false;
  }

  return true;
}

export 
