import { homedir, tmpdir } from "os";
import { downloadAndInstallGithubAsset } from "./download.mjs";
import { getRustToolsReleases, GithubRepository } from "./githubREST.mjs";
import { mkdirSync, renameSync } from "fs";
import Logger, { LoggerSource } from "../logger.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { env, ProgressLocation, Uri, window, workspace } from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { dirname, join } from "path";

/*const STABLE_INDEX_DOWNLOAD_URL =
  "https://static.rust-lang.org/dist/channel-rust-stable.toml";*/

const execAsync = promisify(exec);

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
  cargoExecutable: string,
  packageName: string,
  locked = false,
  moreEnv: { [key: string]: string }
): Promise<boolean> {
  const prefix = process.platform === "win32" ? "&" : "";
  const command = `${prefix}"${cargoExecutable}" install ${
    locked ? "--locked " : ""
  }${packageName}`;

  let customEnv = process.env;
  customEnv.PATH += `${process.platform === "win32" ? ";" : ":"}${dirname(
    cargoExecutable
  )}`;
  if ("PATH" in moreEnv) {
    customEnv.PATH += `${process.platform === "win32" ? ";" : ":"}${
      moreEnv.PATH
    }`;
    delete moreEnv.PATH;
  }
  if (moreEnv) {
    // TODO: what with duplicates?
    customEnv = {
      ...customEnv,
      ...moreEnv,
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stdout, stderr } = await execAsync(
      `${command} install ${locked ? "--locked " : ""}${packageName}`,
      {
        windowsHide: true,
      }
    );

    if (stderr) {
      // TODO: find better solution
      if (
        stderr.toLowerCase().includes("already exists") ||
        stderr.toLowerCase().includes("to your path") ||
        stderr.toLowerCase().includes("is already installed") ||
        stderr.toLowerCase().includes("yanked in registry")
      ) {
        Logger.debug(
          LoggerSource.rustUtil,
          `Cargo package '${packageName}' is already installed ` +
            "or cargo bin not in PATH:",
          stderr
        );

        return true;
      }

      Logger.error(
        LoggerSource.rustUtil,
        `Failed to install cargo command '${command}': ${stderr}`
      );

      return false;
    }

    Logger.debug(LoggerSource.rustUtil, `Cargo install output: ${stdout}`);

    return true;
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
        `Cargo command '${command}' failed but ignoring:`,
        msg
      );

      return true;
    } else {
      Logger.error(
        LoggerSource.rustUtil,
        `Failed to install cargo command '${command}': ${msg}`
      );

      return false;
    }
  }
}

export function detectExistingRustInstallation(): boolean {
  const dir = joinPosix(homedir(), ".pico-sdk", "rust");

  try {
    const contents = readdirSync(dir);

    // Check if the directory contains a subdirectory if yes delete it
    if (contents.length > 0) {
      for (const itemToDelete of contents) {
        const itemPath = joinPosix(dir, itemToDelete);
        try {
          rmSync(itemPath, { recursive: true, force: true });
        } catch (error) {
          Logger.debug(
            LoggerSource.rustUtil,
            "Error deleting existing Rust installation:",
            unknownErrorToString(error)
          );
        }
      }

      return true;
    } else {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Merges multiple directories at the top level into a single directory structure.
 *
 * @param parentDir - The path to the parent directory containing the subdirectories to merge.
 */
async function mergeDirectories(parentDir: string): Promise<void> {
  // Get a list of all directories in the parent directory
  const directories: string[] = (await readdir(parentDir)).filter(async dir => {
    const stats = await stat(join(parentDir, dir));

    return stats.isDirectory();
  });

  // Define the subdirectories we want to merge
  const subDirs: string[] = ["bin", "etc", "lib", "libexec", "share"];

  // Create the top-level directories if they do not exist
  await Promise.all(
    subDirs.map(async subDir => {
      const destSubDir: string = join(parentDir, subDir);
      try {
        await mkdir(destSubDir, { recursive: true });
      } catch {
        // Ignore error if directory already exists
      }
    })
  );

  // Function to merge directories
  const mergeSubDirectories = async (
    srcDir: string,
    destDir: string
  ): Promise<void> => {
    const items: string[] = await readdir(srcDir);

    await Promise.all(
      items.map(async item => {
        const srcItemPath: string = join(srcDir, item);
        const destItemPath: string = join(destDir, item);

        const stats = await stat(srcItemPath);
        if (stats.isDirectory()) {
          // If the item is a directory, merge it recursively
          await mkdir(destItemPath, { recursive: true });
          await mergeSubDirectories(srcItemPath, destItemPath);
        } else {
          // If it's a file, copy it
          await copyFile(srcItemPath, destItemPath);
        }
      })
    );
  };

  // Merge the contents of the subdirectories into the top-level structure
  await Promise.all(
    directories.map(async directory => {
      const dirPath: string = join(parentDir, directory);

      await Promise.all(
        subDirs.map(async subDir => {
          const sourcePath: string = join(dirPath, subDir);

          try {
            const stats = await stat(sourcePath);
            if (stats.isDirectory()) {
              await mergeSubDirectories(sourcePath, join(parentDir, subDir));
            }
          } catch {
            // Ignore error if directory does not exist
          }
        })
      );
    })
  );

  // Remove the old directories after merging their contents
  await Promise.all(
    directories.map(async directory => {
      await rm(join(parentDir, directory), {
        recursive: true,
        force: true,
      });
    })
  );
}

// TODO: move task env setup for this into a command
async function installPortableMSVC(): Promise<boolean> {
  const python = await findPython();
  if (!python) {
    Logger.error(LoggerSource.rustUtil, "Could not find python");

    return false;
  }

  const prefix = process.platform === "win32" ? "&" : "";
  // TODO: ask for license
  const command = `${prefix}"${python}" "${joinPosix(
    getScriptsRoot(),
    "portable-msvc.py"
  )}" --accept-license --msvc-version 14.41 --sdk-version 19041`;

  try {
    const newBase = join(homedir(), ".pico-sdk", "msvc");
    mkdirSync(newBase, { recursive: true });

    const { stdout, stderr } = await execAsync(command, {
      shell: process.platform === "win32" ? "powershell.exe" : undefined,
      windowsHide: true,
      cwd: join(homedir(), ".pico-sdk", "msvc"),
    });

    if (stderr) {
      Logger.error(
        LoggerSource.rustUtil,
        `Failed to install MSVC '${command}': ${stderr}`
      );

      return false;
    }

    const newPath = join(newBase, "14.41");
    // move getScriptsRoot()/msvc to ~/.pico-sdk/msvc/14.41 and symlink to msvc/latest
    renameSync(join(newBase, "msvc"), newPath);

    symlinkSync(newPath, join(newBase, "latest"), "junction");

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      "Failed to install MSVC:",
      unknownErrorToString(error)
    );

    return false;
  }
}

/**
 * Download and installs the latest version of Rust.
 *
 * @returns A promise that resolves to an object containing the
 * paths to the installed `rustc` and `cargo` executables,
 * or `undefined` if the installation failed.
 */
export async function downloadAndInstallRust(): Promise<string | undefined> {
  // TODO: use channel rust stable instead
  const rustReleases = await getRustReleases();
  const latestRelease = rustReleases[0];

  const downloadLink = computeDownloadLink(latestRelease);
  const targetDirectory = joinPosix(
    homedir(),
    ".pico-sdk",
    "rust",
    latestRelease
  );

  if (existsSync(targetDirectory)) {
    Logger.debug(
      LoggerSource.rustUtil,
      `Latest Rust ${latestRelease} already installed, skipping installation`
    );

    return joinPosix(
      targetDirectory,
      "bin",
      "cargo" + (process.platform === "win32" ? ".exe" : "")
    );
  }

  const existingInstallation = detectExistingRustInstallation();

  // Download and install Rust
  let progressState = 0;
  const result = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing Rust",
      cancellable: false,
    },
    async progress =>
      downloadAndInstallArchive(
        downloadLink,
        targetDirectory,
        `rust-${latestRelease}.tar.xz`,
        "Rust",
        undefined,
        undefined,
        undefined,
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({ increment: percent - progressState });
          progressState = percent;
        }
      )
  );
  if (!result) {
    return undefined;
  }

  const index = await downloadAndReadFile(STABLE_INDEX_DOWNLOAD_URL);
  if (!index) {
    try {
      rmSync(targetDirectory, { recursive: true, force: true });
    } catch {
      /* */
    }

    return undefined;
  }
  Logger.debug(LoggerSource.rustUtil, "Downloaded Rust index file");

  try {
    const data: IndexToml = parseToml(index) as IndexToml;

    const targetTriple = "thumbv6m-none-eabi";
    if (
      data.pkg &&
      data.pkg["rust-std"] &&
      data.pkg["rust-std"].target &&
      data.pkg["rust-std"].target[targetTriple] &&
      data.pkg["rust-std"].target[targetTriple].available
    ) {
      const stdDownloadLink = data.pkg["rust-std"].target[targetTriple].xz_url;
      progressState = 0;
      const targetLabel = `rust-std-${targetTriple}`;
      const newTargetDirectory = joinPosix(targetDirectory, targetLabel);
      const result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Pico Rust target stdlib",
          cancellable: false,
        },
        async progress =>
          downloadAndInstallArchive(
            stdDownloadLink,
            newTargetDirectory,
            `rust-pico-${latestRelease}-std.tar.xz`,
            "Rust Pico Standard Library",
            undefined,
            undefined,
            undefined,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({ increment: percent - progressState });
              progressState = percent;
            },
            `rust-std-${latestRelease}-${targetTriple}/${targetLabel}`
          )
      );

      if (!result) {
        try {
          rmSync(targetDirectory, { recursive: true, force: true });
        } catch {
          /* */
        }

        return;
      }
    } else {
      Logger.error(
        LoggerSource.rustUtil,
        "Error parsing Rust index file: std not available"
      );

      try {
        rmSync(targetDirectory, { recursive: true, force: true });
      } catch {
        /* */
      }

      return;
    }

    if (
      data.pkg &&
      data.pkg["rust-analysis"] &&
      data.pkg["rust-analysis"].target &&
      data.pkg["rust-analysis"].target[targetTriple] &&
      data.pkg["rust-analysis"].target[targetTriple].available
    ) {
      const stdDownloadLink =
        data.pkg["rust-analysis"].target[targetTriple].xz_url;
      progressState = 0;
      const targetLabel = `rust-analysis-${targetTriple}`;
      const newTargetDirectory = joinPosix(targetDirectory, targetLabel);
      const result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Pico Rust target analysis library",
          cancellable: false,
        },
        async progress =>
          downloadAndInstallArchive(
            stdDownloadLink,
            newTargetDirectory,
            `rust-pico-${latestRelease}-analysis.tar.xz`,
            "Rust Pico Analysis Library",
            undefined,
            undefined,
            undefined,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({ increment: percent - progressState });
              progressState = percent;
            },
            `rust-analysis-${latestRelease}-${targetTriple}/${targetLabel}`
          )
      );

      if (!result) {
        try {
          rmSync(targetDirectory, { recursive: true, force: true });
        } catch {
          /* */
        }

        return;
      }
    } else {
      Logger.error(
        LoggerSource.rustUtil,
        "Error parsing Rust index file: analysis not available"
      );

      try {
        rmSync(targetDirectory, { recursive: true, force: true });
      } catch {
        /* */
      }

/**
 * Installs all requirements for embedded Rust development.
 * (if required)
 *
 * @returns {boolean} True if all requirements are met or have been installed, false otherwise.
 */
export async function downloadAndInstallRust(): Promise<boolean> {
  /*try {
    const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
    const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
    const commands = [
      `${rustup} target add thumbv6m-none-eabi`,
      `${cargo} install flip-link`,
      `${cargo} install --locked probe-rs-tools`,
      `${cargo} install --locked elf2uf2-rs`,
    ];

    // merge all dirs up by one lvl
    await mergeDirectories(targetDirectory);

    if (process.platform === "win32") {
      // install portable MSVC
      const result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Installing MSVC",
          cancellable: false,
        },
        async () => installPortableMSVC()
      );
      // TODO: error handling
      if (!result) {
        try {
          rmSync(targetDirectory, { recursive: true, force: true });
        } catch {
          /* */
        }

        return;
      }
    }

    // install dependencies
    const cargoExecutable = joinPosix(
      targetDirectory,
      "bin",
      "cargo" + (process.platform === "win32" ? ".exe" : "")
    );

    // TODO: add error handling
    let result = await cargoInstall(cargoExecutable, "flip-link", false, {});
    if (!result) {
      return undefined;
    }
    const hd = homedir().replaceAll("\\", "/");
    // TODO: install cmake
    result = await cargoInstall(
      cargoExecutable,
      "probe-rs-tools",
      true,
      // TODO: load cmake version dynamically and download if not present
      process.platform === "win32"
        ? {
            PATH: `${hd}/.pico-sdk/cmake/v3.28.6/bin;${hd}/.pico-sdk/rust/latest/bin;${hd}/.pico-sdk/msvc/latest/VC/Tools/MSVC/14.41.34120/bin/Hostx64/x64;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/bin/10.0.19041.0/x64;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/bin/10.0.19041.0/x64/ucrt`,

            // eslint-disable-next-line @typescript-eslint/naming-convention
            VSCMD_ARG_HOST_ARCH: "x64",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            VSCMD_ARG_TGT_ARCH: "x64",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            VCToolsVersion: "14.41.34120",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            WindowsSDKVersion: "10.0.19041.0",
            // eslint-disable-next-line @typescript-eslint/naming-convention, max-len
            VCToolsInstallDir: `${hd}/.pico-sdk/msvc/latest/VC/Tools/MSVC/14.41.34120/`,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            WindowsSdkBinPath: `${hd}/.pico-sdk/msvc/latest/Windows Kits/10/bin/`,
            // eslint-disable-next-line @typescript-eslint/naming-convention, max-len
            INCLUDE: `${hd}/.pico-sdk/msvc/latest/VC/Tools/MSVC/14.41.34120/include;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Include/10.0.19041.0/ucrt;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Include/10.0.19041.0/shared;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Include/10.0.19041.0/um;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Include/10.0.19041.0/winrt;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Include/10.0.19041.0/cppwinrt`,
            // eslint-disable-next-line @typescript-eslint/naming-convention, max-len
            LIB: `${hd}/.pico-sdk/msvc/latest/VC/Tools/MSVC/14.41.34120/lib/x64;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Lib/10.0.19041.0/ucrt/x64;${hd}/.pico-sdk/msvc/latest/Windows Kits/10/Lib/10.0.19041.0/um/x64`,
          }
        : // eslint-disable-next-line @typescript-eslint/naming-convention
          { PATH: `${hd}/.pico-sdk/cmake/v3.28.6/bin` }
    );
    if (!result) {
      try {
        rmSync(targetDirectory, { recursive: true, force: true });
      } catch {
        /* */
      }

      return;
    }
    result = await cargoInstall(cargoExecutable, "elf2uf2-rs", true, {});
    if (!result) {
      try {
        rmSync(targetDirectory, { recursive: true, force: true });
      } catch {
        /* */
      }

      return;
    }

  // install flip-link
  const flipLink = "flip-link";
  const result = await cargoInstall(flipLink, false);
  if (!result) {
    void window.showErrorMessage(
      `Failed to install cargo package '${flipLink}'.` +
        "Please check the logs."
    );

    // symlink to latest
    const latestPath = joinPosix(homedir(), ".pico-sdk", "rust", "latest");
    if (existsSync(latestPath)) {
      rmSync(latestPath, { recursive: true, force: true });
    }

  // install probe-rs-tools
  const probeRsTools = "probe-rs-tools";
  const result2 = await cargoInstall(probeRsTools, true);
  if (!result2) {
    void window.showErrorMessage(
      `Failed to install cargo package '${probeRsTools}'.` +
        "Please check the logs."
    );

    try {
      rmSync(targetDirectory, { recursive: true, force: true });
    } catch {
      /* */
    }

  // install elf2uf2-rs
  const elf2uf2Rs = "elf2uf2-rs";
  const result3 = await cargoInstall(elf2uf2Rs, true);
  if (!result3) {
    void window.showErrorMessage(
      `Failed to install cargo package '${elf2uf2Rs}'.` +
        "Please check the logs."
    );

    return false;
  }

  // install cargo-generate binary
  const result4 = await installCargoGenerate();
  if (!result4) {
    void window.showErrorMessage(
      "Failed to install cargo-generate. Please check the logs."
    );

    return false;
  }

  return true;
}

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
}

export async function generateRustProject(
  projectFolder: string,
  name: string,
  flashMethod: string
): Promise<boolean> {
  try {
    const valuesFile = join(tmpdir(), "pico-vscode", "values.toml");
    await workspace.fs.createDirectory(Uri.file(dirname(valuesFile)));
    await workspace.fs.writeFile(
      Uri.file(valuesFile),
      // TODO: make selectable in UI
      Buffer.from(`[values]\nflash_method="${flashMethod}"\n`, "utf-8")
    );

    // TODO: fix outside function (maybe)
    let projectRoot = projectFolder;
    if (projectFolder.endsWith(name)) {
      projectRoot = projectFolder.slice(0, projectFolder.length - name.length);
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
}
