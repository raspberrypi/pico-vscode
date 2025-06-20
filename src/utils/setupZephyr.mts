import { existsSync, readdirSync, rmSync } from "fs";
import { window, workspace, Uri } from "vscode";
import { type ExecOptions, exec, spawnSync } from "child_process";
import { join as joinPosix } from "path/posix";
import { homedir } from "os";
import Logger from "../logger.mjs";

import {
  buildZephyrWorkspacePath,
  downloadAndInstallArchive,
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallOpenOCD,
  downloadAndInstallPicotool,
  downloadFileGot,
} from "../utils/download.mjs";
import Settings, { HOME_VAR } from "../settings.mjs";
import { openOCDVersion } from "../webview/newProjectPanel.mjs";
import findPython, { showPythonNotFoundError } from "../utils/pythonHelper.mjs";
import { ensureGit } from "../utils/gitUtil.mjs";

const _logger = new Logger("zephyrSetup");

function _runCommand(
  command: string,
  options: ExecOptions
): Promise<number | null> {
  _logger.debug(`Running: ${command}`);

  return new Promise<number | null>(resolve => {
    const generatorProcess = exec(command, options, (error, stdout, stderr) => {
      _logger.debug(stdout);
      _logger.info(stderr);
      if (error) {
        _logger.error(`Setup venv error: ${error.message}`);
        resolve(null); // indicate error
      }
    });

    generatorProcess.on("exit", code => {
      // Resolve with exit code or -1 if code is undefined
      resolve(code);
    });
  });
}

export async function setupZephyr(): Promise<string | undefined> {
  window.showInformationMessage("Setup Zephyr Command Running");

  const settings = Settings.getInstance();
  if (settings === undefined) {
    _logger.error("Settings not initialized.");

    return;
  }

  // TODO: this does take about 2s - may be reduced
  const gitPath = await ensureGit(settings, { returnPath: true });
  if (typeof gitPath !== "string" || gitPath.length === 0) {
    return;
  }

  _logger.info("Installing CMake");
  const cmakeResult = await downloadAndInstallCmake("v3.31.5");
  if (!cmakeResult) {
    window.showErrorMessage("Could not install CMake. Exiting Zephyr Setup");
  }
  window.showInformationMessage("CMake installed.");

  _logger.info("Installing Ninja");
  const ninjaResult = await downloadAndInstallNinja("v1.12.1");
  if (!ninjaResult) {
    window.showErrorMessage("Could not install Ninja. Exiting Zephyr Setup");
  }
  window.showInformationMessage("Ninja installed.");

  _logger.info("Installing Picotool");
  const picotoolResult = await downloadAndInstallPicotool("2.1.1");
  if (!picotoolResult) {
    window.showErrorMessage("Could not install Ninja. Exiting Zephyr Setup");
  }
  window.showInformationMessage("Picotool installed.");

  const python3Path = await findPython();
  if (!python3Path) {
    _logger.error("Failed to find Python3 executable.");
    showPythonNotFoundError();

    return;
  }

  const isWindows = process.platform === "win32";

  if (isWindows) {
    // Setup other Zephyr dependencies
    _logger.info("Installing dtc");
    const dtcResult = await downloadAndInstallArchive(
      "https://github.com/oss-winget/oss-winget-storage/raw/" +
        "96ea1b934342f45628a488d3b50d0c37cf06012c/packages/dtc/" +
        "1.6.1/dtc-msys2-1.6.1-x86_64.zip",
      joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "dtc"),
      "dtc-msys2-1.6.1-x86_64.zip",
      "dtc"
    );
    if (!dtcResult) {
      window.showErrorMessage("Could not install DTC. Exiting Zephyr Setup");

      return;
    }
    window.showInformationMessage("DTC installed.");

    _logger.info("Installing gperf");
    const gperfResult = await downloadAndInstallArchive(
      "https://sourceforge.net/projects/gnuwin32/files/gperf/3.0.1/" +
        "gperf-3.0.1-bin.zip/download",
      joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "gperf"),
      "gperf-3.0.1-bin.zip",
      "gperf"
    );
    if (!gperfResult) {
      window.showErrorMessage("Could not install gperf. Exiting Zephyr Setup");

      return;
    }
    window.showInformationMessage("gperf installed.");

    _logger.info("Installing wget");
    const wgetResult = await downloadAndInstallArchive(
      "https:///eternallybored.org/misc/wget/releases/wget-1.21.4-win64.zip",
      joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget"),
      "wget-1.21.4-win64.zip",
      "wget"
    );
    if (!wgetResult) {
      window.showErrorMessage("Could not install wget. Exiting Zephyr Setup");

      return;
    }
    window.showInformationMessage("wget installed.");

    _logger.info("Installing 7zip");
    const szipTargetDirectory = joinPosix("C:\\Program Files\\7-Zip");
    if (
      existsSync(szipTargetDirectory) &&
      readdirSync(szipTargetDirectory).length !== 0
    ) {
      _logger.info("7-Zip is already installed.");
    } else {
      const szipURL = new URL("https://7-zip.org/a/7z2409-x64.exe");
      const szipResult = await downloadFileGot(
        szipURL,
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "7zip-x64.exe")
      );

      if (!szipResult) {
        window.showErrorMessage(
          "Could not download 7-Zip. Exiting Zephyr Setup"
        );

        return;
      }

      const szipCommand: string = "7zip-x64.exe";
      const szipInstallResult = await _runCommand(szipCommand, {
        cwd: joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk"),
      });

      if (szipInstallResult !== 0) {
        window.showErrorMessage(
          "Could not install 7-Zip. Please ensure 7-Zip is installed." +
            "Exiting Zephyr Setup"
        );

        return;
      }

      // Clean up
      rmSync(
        joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "7zip-x64.exe")
      );

      window.showInformationMessage("7-Zip installed.");
    }
  }

  _logger.info("Installing OpenOCD");
  const openocdResult = await downloadAndInstallOpenOCD(openOCDVersion);
  if (!openocdResult) {
    window.showErrorMessage("Could not install OpenOCD. Exiting Zephyr Setup");

    return;
  }

  const pythonExe = python3Path.replace(
    HOME_VAR,
    homedir().replaceAll("\\", "/")
  );

  const customEnv = process.env;
  // const customPath = await getPath();
  // _logger.info(`Path: ${customPath}`);
  // if (!customPath) {
  //   return;
  // }

  const customPath = [
    joinPosix(
      homedir().replaceAll("\\", "/"),
      ".pico-sdk",
      "cmake",
      "v3.31.5",
      "bin"
    ),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "dtc", "bin"),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "git", "cmd"),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "gperf", "bin"),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "ninja", "v1.12.1"),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "python", "3.12.6"),
    joinPosix(homedir().replaceAll("\\", "/"), ".pico-sdk", "wget"),
    joinPosix("C:\\Program Files".replaceAll("\\", "/"), "7-Zip"),
    "", // Need this to add separator to end
  ].join(process.platform === "win32" ? ";" : ":");

  _logger.info(`New path: ${customPath}`);

  customPath.replaceAll("/", "\\");
  customEnv[isWindows ? "Path" : "PATH"] =
    customPath + customEnv[isWindows ? "Path" : "PATH"];

  const zephyrWorkspaceDirectory = buildZephyrWorkspacePath();

  const zephyrManifestDir: string = joinPosix(
    zephyrWorkspaceDirectory,
    "manifest"
  );

  const zephyrManifestFile: string = joinPosix(zephyrManifestDir, "west.yml");

  const zephyrManifestContent: string = `
manifest:
  self:
    west-commands: scripts/west-commands.yml

  remotes:
    - name: zephyrproject-rtos
      url-base: https://github.com/magpieembedded

  projects:
    - name: zephyr
      remote: zephyrproject-rtos
      revision: pico2w
      import:
        # By using name-allowlist we can clone only the modules that are
        # strictly needed by the application.
        name-allowlist:
          - cmsis_6      # required by the ARM Cortex-M port
          - hal_rpi_pico # required for Pico board support
          - hal_infineon # required for Wifi chip support
`;

  await workspace.fs.writeFile(
    Uri.file(zephyrManifestFile),
    Buffer.from(zephyrManifestContent)
  );

  const createVenvCommandVenv: string = [
    `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
    "-m venv venv",
  ].join(" ");
  const createVenvCommandVirtualenv: string = [
    `${process.env.ComSpec === "powershell.exe" ? "&" : ""}"${pythonExe}"`,
    "-m virtualenv venv",
  ].join(" ");

  // Create a Zephyr workspace, copy the west manifest in and initialise the workspace
  workspace.fs.createDirectory(Uri.file(zephyrWorkspaceDirectory));

  // Generic result to get value from runCommand calls
  let result: number | null;

  _logger.info("Setting up virtual environment for Zephyr");
  const venvPython: string = joinPosix(
    zephyrWorkspaceDirectory,
    "venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python"
  );
  if (existsSync(venvPython)) {
    _logger.info("Existing Python venv found.");
  } else {
    result = await _runCommand(createVenvCommandVenv, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });
    if (result !== 0) {
      _logger.warn(
        "Could not create virtual environment with venv," +
          "trying with virtualenv..."
      );

      result = await _runCommand(createVenvCommandVirtualenv, {
        cwd: zephyrWorkspaceDirectory,
        windowsHide: true,
        env: customEnv,
      });

      if (result !== 0) {
        _logger.error("Could not create virtual environment. Exiting.");
        window.showErrorMessage("Could not install venv. Exiting Zephyr Setup");

        return;
      }
    }

    _logger.info("Venv created.");
  }

  const venvPythonCommand: string = joinPosix(
    process.env.ComSpec === "powershell.exe" ? "&" : "",
    zephyrWorkspaceDirectory,
    "venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python"
  );

  const installWestCommand: string = [
    venvPythonCommand,
    "-m pip install west pyelftools",
  ].join(" ");

  _logger.info("Installing Python dependencies for Zephyr");
  result = await _runCommand(installWestCommand, {
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });

  const westExe: string = joinPosix(
    process.env.ComSpec === "powershell.exe" ? "&" : "",
    zephyrWorkspaceDirectory,
    "venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "west.exe" : "west"
  );

  const zephyrWorkspaceFiles = await workspace.fs.readDirectory(
    Uri.file(zephyrWorkspaceDirectory)
  );

  const westAlreadyExists = zephyrWorkspaceFiles.find(x => x[0] === ".west");
  if (westAlreadyExists) {
    _logger.info("West workspace already initialised.");
  } else {
    _logger.info("No West workspace found. Initialising...");

    const westInitCommand: string = [westExe, "init -l manifest"].join(" ");
    result = await _runCommand(westInitCommand, {
      cwd: zephyrWorkspaceDirectory,
      windowsHide: true,
      env: customEnv,
    });

    _logger.info(`${result}`);
  }

  const westUpdateCommand: string = [westExe, "update"].join(" ");

  _logger.info("Updating West workspace");
  result = await _runCommand(westUpdateCommand, {
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });

  _logger.info(`${result}`);

  const zephyrExportCommand: string = [westExe, "zephyr-export"].join(" ");
  _logger.info("Exporting Zephyr CMake Files");
  result = await _runCommand(zephyrExportCommand, {
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });

  const westPipPackagesCommand: string = [
    westExe,
    "packages pip --install",
  ].join(" ");

  _logger.info("Installing West Python packages");
  result = await _runCommand(westPipPackagesCommand, {
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });

  _logger.info(`${result}`);

  const westBlobsFetchCommand: string = [
    westExe,
    "blobs fetch hal_infineon",
  ].join(" ");

  _logger.info("Fetching binary blobs for Zephyr");
  result = await _runCommand(westBlobsFetchCommand, {
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });

  _logger.info(`${result}`);

  const westInstallSDKCommand: string = [
    westExe,
    "sdk install -t arm-zephyr-eabi",
    `-b ${zephyrWorkspaceDirectory}`,
  ].join(" ");

  // This has to be a spawn due to the way the underlying SDK command calls
  // subprocess and needs to inherit the Path variables set in customEnv
  _logger.info("Installing Zephyr SDK");
  const child = spawnSync(westInstallSDKCommand, {
    shell: true,
    cwd: zephyrWorkspaceDirectory,
    windowsHide: true,
    env: customEnv,
  });
  _logger.info("stdout: ", child.stdout.toString());
  _logger.info("stderr: ", child.stderr.toString());
  if (child.status) {
    _logger.info("exit code: ", child.status);
    if (child.status !== 0) {
      window.showErrorMessage(
        "Error installing Zephyr SDK." + "Exiting Zephyr Setup."
      );
    }

    return;
  }

  _logger.info(`${result}`);

  _logger.info("Complete");

  return "";
}
