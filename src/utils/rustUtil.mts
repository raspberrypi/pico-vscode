import { readFileSync, writeFileSync } from "fs";
import Logger, { LoggerSource } from "../logger.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { env, ProgressLocation, Uri, window } from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { join } from "path";

/*const STABLE_INDEX_DOWNLOAD_URL =
  "https://static.rust-lang.org/dist/channel-rust-stable.toml";*/

const execAsync = promisify(exec);

export enum FlashMethod {
  debugProbe = 0,
  elf2Uf2 = 1,
  cargoEmbed = 2,
}

/*
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
}*/

export async function cargoInstall(
  packageName: string,
  locked = false
): Promise<string | undefined> {
  const command = process.platform === "win32" ? "cargo.exe" : "cargo";

  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stdout, stderr } = await execAsync(
      `${command} install ${locked ? "--locked " : ""}${packageName}`,
      {
        windowsHide: true,
      }
    );

    return;
  } catch (error) {
    const msg = unknownErrorToString(error);
    if (
      msg.toLowerCase().includes("already exists") ||
      msg.toLowerCase().includes("to your path") ||
      msg.toLowerCase().includes("is already installed") ||
      msg.toLowerCase().includes("yanked in registry")
    ) {
      Logger.warn(
        LoggerSource.rustUtil,
        `Cargo package '${packageName}' is already installed ` +
          "or cargo bin not in PATH:",
        msg
      );

      return;
    }
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to install cargo package '${packageName}': ${unknownErrorToString(
        error
      )}`
    );

    return unknownErrorToString(error);
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
    // TODO: maybe listen for stderr
    // this will automatically take care of having the correct
    // recommended host toolchain installed except for snap rustup installs
    const { stdout } = await execAsync("rustup show", {
      windowsHide: true,
    });

    if (stdout.includes("no active toolchain")) {
      await execAsync("rustup default stable", {
        windowsHide: true,
      });
    }

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

/**
 * Installs all requirements for embedded Rust development.
 * (if required)
 *
 * @returns {boolean} True if all requirements are met or have been installed, false otherwise.
 */
export async function downloadAndInstallRust(): Promise<boolean> {
  const result = await checkRustInstallation();
  if (!result) {
    return false;
  }

  // install targets
  const targets = [
    "thumbv6m-none-eabi",
    "thumbv8m.main-none-eabihf",
    "riscv32imac-unknown-none-elf",
  ];
  for (const target of targets) {
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
  }

  // install flip-link
  const flipLink = "flip-link";
  let cargoInstResult = await cargoInstall(flipLink, false);
  if (cargoInstResult !== undefined) {
    if (cargoInstResult.includes("error: linker `link.exe` not found")) {
      void window
        .showErrorMessage(
          `Failed to install cargo package '${flipLink}'` +
            " because the MSVC linker is not found" +
            " or Windows SDK components are missing.",
          "More Info"
        )
        .then(selection => {
          if (selection === "More Info") {
            env.openExternal(
              Uri.parse(
                // eslint-disable-next-line max-len
                "https://rust-lang.github.io/rustup/installation/windows-msvc.html#manual-install",
                true
              )
            );
          }
        });
    } else {
      void window.showErrorMessage(
        `Failed to install cargo package '${flipLink}'.` +
          "Please check the logs."
      );
    }

    return false;
  }

  // or install probe-rs-tools
  const probeRsTools = "defmt-print";
  cargoInstResult = await cargoInstall(probeRsTools, true);
  if (!cargoInstResult) {
    void window.showErrorMessage(
      `Failed to install cargo package '${probeRsTools}'.` +
        "Please check the logs."
    );

    return false;
  }

  // install elf2uf2-rs
  const elf2uf2Rs = "elf2uf2-rs";
  cargoInstResult = await cargoInstall(elf2uf2Rs, true);
  if (!cargoInstResult) {
    void window.showErrorMessage(
      `Failed to install cargo package '${elf2uf2Rs}'.` +
        "Please check the logs."
    );

    return false;
  }

  // install cargo-generate binary
  /*result = await installCargoGenerate();
  if (!result) {
    void window.showErrorMessage(
      "Failed to install cargo-generate. Please check the logs."
    );

    return false;
  }*/

  return true;
}

/*
function platformToGithubMatrix(platform: string): string {
  switch (platform) {
    case "darwin":
      return "macos-latest";
    case "linux":
      return "ubuntu-latest";
    case "win32":
      return "windows-latest";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function archToGithubMatrix(arch: string): string {
  switch (arch) {
    case "x64":
      return "x86_64";
    case "arm64":
      return "aarch64";
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

async function installCargoGenerate(): Promise<boolean> {
  const release = await getRustToolsReleases();
  if (!release) {
    Logger.error(LoggerSource.rustUtil, "Failed to get Rust tools releases");

    return false;
  }

  const assetName = `cargo-generate-${platformToGithubMatrix(
    process.platform
  )}-${archToGithubMatrix(process.arch)}.zip`;

  const tmpLoc = join(tmpdir(), "pico-vscode-rs");

  const result = await downloadAndInstallGithubAsset(
    release[0],
    release[0],
    GithubRepository.rsTools,
    tmpLoc,
    "cargo-generate.zip",
    assetName,
    "cargo-generate"
  );

  if (!result) {
    Logger.error(LoggerSource.rustUtil, "Failed to install cargo-generate");

    return false;
  }

  const cargoBin = join(homedir(), ".cargo", "bin");

  try {
    mkdirSync(cargoBin, { recursive: true });
    renameSync(
      join(
        tmpLoc,
        "cargo-generate" + (process.platform === "win32" ? ".exe" : "")
      ),
      join(
        cargoBin,
        "cargo-generate" + (process.platform === "win32" ? ".exe" : "")
      )
    );

    if (process.platform !== "win32") {
      await execAsync(`chmod +x ${join(cargoBin, "cargo-generate")}`, {
        windowsHide: true,
      });
    }
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to move cargo-generate to ~/.cargo/bin: ${unknownErrorToString(
        error
      )}`
    );

    return false;
  }

  return true;
}*/

/*
function flashMethodToArg(fm: FlashMethod): string {
  switch (fm) {
    case FlashMethod.cargoEmbed:
    case FlashMethod.debugProbe:
      return "probe-rs";
    case FlashMethod.elf2Uf2:
      return "elf2uf2-rs";
  }
}


export async function generateRustProject(
  projectFolder: string,
  name: string,
  flashMethod: FlashMethod
): Promise<boolean> {
  try {
    const valuesFile = join(tmpdir(), "pico-vscode", "values.toml");
    await workspace.fs.createDirectory(Uri.file(dirname(valuesFile)));
    await workspace.fs.writeFile(
      Uri.file(valuesFile),
      // TODO: make selectable in UI
      Buffer.from(
        `[values]\nflash_method="${flashMethodToArg(flashMethod)}"\n`,
        "utf-8"
      )
    );

    // TODO: fix outside function (maybe)
    let projectRoot = projectFolder.replaceAll("\\", "/");
    if (projectRoot.endsWith(name)) {
      projectRoot = projectRoot.slice(0, projectRoot.length - name.length);
    }

    // cache template and use --path
    const command =
      "cargo generate --git " +
      "https://github.com/rp-rs/rp2040-project-template " +
      ` --name ${name} --values-file "${valuesFile}" ` +
      `--destination "${projectRoot}"`;

    const customEnv = { ...process.env };
    customEnv["PATH"] += `${process.platform === "win32" ? ";" : ":"}${join(
      homedir(),
      ".cargo",
      "bin"
    )}`;
    // TODO: add timeout
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stdout, stderr } = await execAsync(command, {
      windowsHide: true,
      env: customEnv,
    });

    if (stderr) {
      Logger.error(
        LoggerSource.rustUtil,
        `Failed to generate Rust project: ${stderr}`
      );

      return false;
    }
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to generate Rust project: ${unknownErrorToString(error)}`
    );

    return false;
  }

  return true;
}*/

/**
 * Get the selected chip from the .pico-rs file in the workspace folder.
 *
 * @param workspaceFolder The workspace folder path.
 * @returns Returns the selected chip or null if the file does not exist or is invalid.
 */
export function rustProjectGetSelectedChip(
  workspaceFolder: string
): "rp2040" | "rp2350" | "rp2350-riscv" | null {
  const picors = join(workspaceFolder, ".pico-rs");

  try {
    const contents = readFileSync(picors, "utf-8").trim();

    if (
      contents !== "rp2040" &&
      contents !== "rp2350" &&
      contents !== "rp2350-riscv"
    ) {
      Logger.error(
        LoggerSource.rustUtil,
        `Invalid chip in .pico-rs: ${contents}`
      );

      // reset to rp2040
      writeFileSync(picors, "rp2040", "utf-8");

      return "rp2040";
    }

    return contents;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to read .pico-rs: ${unknownErrorToString(error)}`
    );

    return null;
  }
}
