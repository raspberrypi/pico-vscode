import {
  workspace,
  type ExtensionContext,
  window,
  type WebviewPanel,
  commands,
  ProgressLocation,
  Uri,
  FileSystemError,
  type WorkspaceFolder,
} from "vscode";
import {
  extensionName,
  type Command,
  type CommandWithArgs,
  type CommandWithResult,
} from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import Logger, { LoggerSource } from "./logger.mjs";
import {
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX,
  CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD,
  cmakeGetPicoVar,
  cmakeGetSelectedBoard,
  cmakeGetSelectedToolchainAndSDKVersions,
  configureCmakeNinja,
} from "./utils/cmakeUtil.mjs";
import Settings, {
  SettingsKey,
  type PackageJSON,
  HOME_VAR,
} from "./settings.mjs";
import UI from "./ui.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import CompileProjectCommand from "./commands/compileProject.mjs";
import RunProjectCommand from "./commands/runProject.mjs";
import LaunchTargetPathCommand, {
  LaunchTargetPathReleaseCommand,
  SbomTargetPathDebugCommand,
  SbomTargetPathReleaseCommand,
} from "./commands/launchTargetPath.mjs";
import {
  GetPythonPathCommand,
  GetEnvPathCommand,
  GetGDBPathCommand,
  GetCompilerPathCommand,
  GetCxxCompilerPathCommand,
  GetChipCommand,
  GetTargetCommand,
  GetChipUppercaseCommand,
  GetPicotoolPathCommand,
  GetOpenOCDRootCommand,
  GetSVDPathCommand,
  GetWestPathCommand,
  GetZephyrWorkspacePathCommand,
  GetZephyrSDKPathCommand,
} from "./commands/getPaths.mjs";
import {
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
  downloadAndInstallPicotool,
  downloadAndInstallOpenOCD,
} from "./utils/download.mjs";
import { getSupportedToolchains } from "./utils/toolchainUtil.mjs";
import {
  NewProjectPanel,
  getWebviewOptions,
} from "./webview/newProjectPanel.mjs";
import GithubApiCache from "./utils/githubApiCache.mjs";
import ClearGithubApiCacheCommand from "./commands/clearGithubApiCache.mjs";
import { ContextKeys } from "./contextKeys.mjs";
import { PicoProjectActivityBar } from "./webview/activityBar.mjs";
import ConditionalDebuggingCommand from "./commands/conditionalDebugging.mjs";
import DebugLayoutCommand from "./commands/debugLayout.mjs";
import OpenSdkDocumentationCommand from "./commands/openSdkDocumentation.mjs";
import ConfigureCmakeCommand, {
  CleanCMakeCommand,
  SwitchBuildTypeCommand,
} from "./commands/configureCmake.mjs";
import ImportProjectCommand from "./commands/importProject.mjs";
import { homedir } from "os";
import NewExampleProjectCommand from "./commands/newExampleProject.mjs";
import SwitchBoardCommand from "./commands/switchBoard.mjs";
import UninstallPicoSDKCommand from "./commands/uninstallPicoSDK.mjs";
import UpdateOpenOCDCommand from "./commands/updateOpenOCD.mjs";
import FlashProjectSWDCommand from "./commands/flashProjectSwd.mjs";
// eslint-disable-next-line max-len
import { NewMicroPythonProjectPanel } from "./webview/newMicroPythonProjectPanel.mjs";
import type { Progress as GotProgress } from "got";
import findPython, { showPythonNotFoundError } from "./utils/pythonHelper.mjs";
import {
  downloadAndInstallRust,
  installLatestRustRequirements,
  rustProjectGetSelectedChip,
} from "./utils/rustUtil.mjs";
import State from "./state.mjs";
import { cmakeToolsForcePicoKit } from "./utils/cmakeToolsUtil.mjs";
import { NewRustProjectPanel } from "./webview/newRustProjectPanel.mjs";
import {
  CMAKELISTS_ZEPHYR_HEADER,
  OPENOCD_VERSION,
  SDK_REPOSITORY_URL,
} from "./utils/sharedConstants.mjs";
import VersionBundlesLoader from "./utils/versionBundles.mjs";
import { unknownErrorToString } from "./utils/errorHelper.mjs";
import {
  getBoardFromZephyrProject,
  getZephyrVersion,
  setupZephyr,
  updateZephyrCompilerPath,
  zephyrVerifyCMakCache,
} from "./utils/setupZephyr.mjs";
import { IMPORT_PROJECT } from "./commands/cmdIds.mjs";
import {
  ZEPHYR_PICO,
  ZEPHYR_PICO2,
  ZEPHYR_PICO2_W,
  ZEPHYR_PICO_W,
} from "./models/zephyrBoards.mjs";
import { NewZephyrProjectPanel } from "./webview/newZephyrProjectPanel.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.info(LoggerSource.extension, "Extension activation triggered");

  const settings = Settings.createInstance(
    context.workspaceState,
    context.globalState,
    context.extension.packageJSON as PackageJSON
  );
  GithubApiCache.createInstance(context);

  const picoProjectActivityBarProvider = new PicoProjectActivityBar();
  const ui = new UI(picoProjectActivityBarProvider);
  ui.init();

  const COMMANDS: Array<
    | Command
    | CommandWithResult<string>
    | CommandWithResult<string | undefined>
    | CommandWithResult<boolean>
    | CommandWithArgs
  > = [
    new NewProjectCommand(context.extensionUri),
    new SwitchSDKCommand(ui, context.extensionUri),
    new SwitchBoardCommand(ui, context.extensionUri),
    new LaunchTargetPathCommand(),
    new LaunchTargetPathReleaseCommand(),
    new GetPythonPathCommand(),
    new GetEnvPathCommand(),
    new GetGDBPathCommand(context.extensionUri),
    new GetCompilerPathCommand(),
    new GetCxxCompilerPathCommand(),
    new GetChipCommand(),
    new GetChipUppercaseCommand(),
    new GetTargetCommand(),
    new GetPicotoolPathCommand(),
    new GetOpenOCDRootCommand(),
    new GetSVDPathCommand(context.extensionUri),
    new GetWestPathCommand(),
    new GetZephyrWorkspacePathCommand(),
    new GetZephyrSDKPathCommand(),
    new CompileProjectCommand(),
    new RunProjectCommand(),
    new FlashProjectSWDCommand(),
    new ClearGithubApiCacheCommand(),
    new ConditionalDebuggingCommand(),
    new DebugLayoutCommand(),
    new OpenSdkDocumentationCommand(context.extensionUri),
    new ConfigureCmakeCommand(),
    new SwitchBuildTypeCommand(ui),
    new ImportProjectCommand(context.extensionUri),
    new NewExampleProjectCommand(context.extensionUri),
    new UninstallPicoSDKCommand(),
    new CleanCMakeCommand(ui),
    new UpdateOpenOCDCommand(),
    new SbomTargetPathDebugCommand(),
    new SbomTargetPathReleaseCommand(),
  ];

  // register all command handlers
  COMMANDS.forEach(command => {
    context.subscriptions.push(command.register());
  });

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(
        webviewPanel: WebviewPanel,
        state: { isImportProject: boolean; forceFromExample: boolean }
      ): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewProjectPanel.revive(
          webviewPanel,
          context.extensionUri,
          state && state.isImportProject,
          state && state.forceFromExample
        );
      },
    })
  );

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewMicroPythonProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewMicroPythonProjectPanel.revive(webviewPanel, context.extensionUri);
      },
    })
  );

  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewRustProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewRustProjectPanel.revive(webviewPanel, context.extensionUri);
      },
    })
  );

  // TODO: currently broken
  context.subscriptions.push(
    window.registerWebviewPanelSerializer(NewZephyrProjectPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        NewZephyrProjectPanel.revive(webviewPanel, context.extensionUri);
      },
    })
  );

  context.subscriptions.push(
    window.registerTreeDataProvider(
      PicoProjectActivityBar.viewType,
      picoProjectActivityBarProvider
    )
  );

  const workspaceFolder = workspace.workspaceFolders?.[0];
  const isRustProject = workspaceFolder
    ? existsSync(join(workspaceFolder.uri.fsPath, ".pico-rs"))
    : false;

  // check if there is a workspace folder
  if (workspaceFolder === undefined) {
    // finish activation
    Logger.warn(LoggerSource.extension, "No workspace folder found.");
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );

    return;
  }

  await commands.executeCommand(
    "setContext",
    ContextKeys.isRustProject,
    isRustProject
  );
  State.getInstance().isRustProject = isRustProject;

  if (!isRustProject) {
    const cmakeListsFilePath = join(
      workspaceFolder.uri.fsPath,
      "CMakeLists.txt"
    );
    if (!existsSync(cmakeListsFilePath)) {
      Logger.warn(
        LoggerSource.extension,
        "No CMakeLists.txt in workspace folder has been found."
      );
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );

      return;
    }

    // Set Pico Zephyr Project false by default
    await commands.executeCommand(
      "setContext",
      ContextKeys.isZephyrProject,
      false
    );

    const cmakeListsContents = new TextDecoder().decode(
      await workspace.fs.readFile(Uri.file(cmakeListsFilePath))
    );

    // Check for pico_zephyr in CMakeLists.txt
    if (cmakeListsContents.startsWith(CMAKELISTS_ZEPHYR_HEADER)) {
      Logger.info(LoggerSource.extension, "Project is of type: Zephyr");

      const vb = new VersionBundlesLoader(context.extensionUri);
      const latest = await vb.getLatest();
      if (latest === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get latest version bundle for Zephyr project."
        );

        void window.showErrorMessage(
          "Failed to get latest version bundle for Zephyr project."
        );

        return;
      }

      const cmakePath = settings.getString(SettingsKey.cmakePath);
      // TODO: or auto upgrade to latest cmake
      if (cmakePath === undefined) {
        Logger.error(
          LoggerSource.extension,
          "CMake path not set in settings. Cannot setup Zephyr project."
        );
        void window.showErrorMessage(
          "CMake path not set in settings. Cannot setup Zephyr project."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      let cmakeVersion = "";
      if (cmakePath && cmakePath.includes("/.pico-sdk/cmake")) {
        const version = /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//.exec(
          cmakePath
        )?.[1];

        if (version === undefined) {
          Logger.error(
            LoggerSource.extension,
            "Failed to get CMake version from path in the settings."
          );
          await commands.executeCommand(
            "setContext",
            ContextKeys.isPicoProject,
            false
          );

          return;
        }

        cmakeVersion = version;
      }

      const ninjaPath = settings.getString(SettingsKey.ninjaPath);
      let ninjaVersion = "";
      if (ninjaPath === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Ninja path not set in settings. Cannot setup Zephyr project."
        );
        void window.showErrorMessage(
          "Ninja path not set in settings. Cannot setup Zephyr project."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      } else if (ninjaPath && ninjaPath.includes("/.pico-sdk/ninja")) {
        const version = /\/\.pico-sdk\/ninja\/([v.0-9]+)\//.exec(
          ninjaPath
        )?.[1];
        if (version === undefined) {
          Logger.error(
            LoggerSource.extension,
            "Failed to get Ninja version from path in the settings."
          );
          await commands.executeCommand(
            "setContext",
            ContextKeys.isPicoProject,
            false
          );

          return;
        }

        ninjaVersion = version;
      }

      const result = await setupZephyr({
        extUri: context.extensionUri,
        cmakeMode: cmakeVersion !== "" ? 2 : 3,
        cmakePath:
          cmakeVersion !== ""
            ? ""
            : cmakePath.replace(HOME_VAR, homedir().replaceAll("\\", "/")) ??
              "",
        cmakeVersion: cmakeVersion,
        ninjaMode: ninjaVersion !== "" ? 2 : 3,
        ninjaPath:
          ninjaVersion !== ""
            ? ""
            : ninjaPath.replace(HOME_VAR, homedir().replaceAll("\\", "/")) ??
              "",
        ninjaVersion: ninjaVersion,
      });
      if (result === undefined) {
        void window.showErrorMessage(
          "Failed to setup Zephyr Toolchain. See logs for details."
        );

        return;
      }
      void window.showInformationMessage(
        "Zephyr Toolchain setup done. You can now build your project."
      );

      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        true
      );
      await commands.executeCommand(
        "setContext",
        ContextKeys.isZephyrProject,
        true
      );
      State.getInstance().isZephyrProject = true;

      ui.showStatusBarItems(false, true);
      const selectedZephyrVersion = await getZephyrVersion();
      if (selectedZephyrVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get selected system Zephyr version. Defaulting to main."
        );
      }
      ui.updateSDKVersion(selectedZephyrVersion ?? "main");

      const cppCompilerUpdated = await updateZephyrCompilerPath(
        workspaceFolder.uri,
        selectedZephyrVersion ?? "main"
      );

      if (!cppCompilerUpdated) {
        void window.showErrorMessage(
          "Failed to update C++ compiler path in c_cpp_properties.json"
        );

        // TODO: maybe cancel activation
      }

      await zephyrVerifyCMakCache(workspaceFolder.uri);

      // Update the board info if it can be found in tasks.json
      const tasksJsonFilePath = join(
        workspaceFolder.uri.fsPath,
        ".vscode",
        "tasks.json"
      );

      // Update UI with board description
      const board = await getBoardFromZephyrProject(tasksJsonFilePath);

      if (board !== undefined) {
        if (board === ZEPHYR_PICO2_W) {
          ui.updateBoard("Pico 2W");
        } else if (board === ZEPHYR_PICO2) {
          ui.updateBoard("Pico 2");
        } else if (board === ZEPHYR_PICO_W) {
          ui.updateBoard("Pico W");
        } else if (board === ZEPHYR_PICO) {
          ui.updateBoard("Pico");
        } else {
          ui.updateBoard("Other");
        }
      }

      if (settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
        await cmakeSetupAutoConfigure(workspaceFolder, ui);
      } else {
        // check if build dir is empty and recommend to run a build to
        // get the intellisense working
        const buildUri = Uri.file(join(workspaceFolder.uri.fsPath, "build"));
        try {
          // workaround to stop verbose logging of readDirectory
          // internals even if we catch the error
          await workspace.fs.stat(buildUri);
          const buildDirContents = await workspace.fs.readDirectory(buildUri);

          if (buildDirContents.length === 0) {
            void window.showWarningMessage(
              "To get full intellisense support please build the project once."
            );
          }
        } catch (error) {
          if (
            error instanceof FileSystemError &&
            error.code === "FileNotFound"
          ) {
            void window.showWarningMessage(
              "To get full intellisense support please build the project once."
            );

            Logger.debug(
              LoggerSource.extension,
              'No "build" folder found. Intellisense might not work ' +
                "properly until a build has been done."
            );
          } else {
            Logger.error(
              LoggerSource.extension,
              "Error when reading build folder:",
              unknownErrorToString(error)
            );
          }
        }
      }

      return;
    }
    // check for pico_sdk_init() in CMakeLists.txt
    else if (!cmakeListsContents.includes("pico_sdk_init()")) {
      Logger.warn(
        LoggerSource.extension,
        "No pico_sdk_init() in CMakeLists.txt found."
      );
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );

      return;
    }

    // check if it has .vscode folder and cmake donotedit header in CMakelists.txt
    if (
      !existsSync(join(workspaceFolder.uri.fsPath, ".vscode")) ||
      !(
        readFileSync(cmakeListsFilePath)
          .toString("utf-8")
          .includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX) ||
        readFileSync(cmakeListsFilePath)
          .toString("utf-8")
          .includes(CMAKE_DO_NOT_EDIT_HEADER_PREFIX_OLD)
      )
    ) {
      Logger.warn(
        LoggerSource.extension,
        "No .vscode folder and/or cmake",
        '"DO NOT EDIT"-header in CMakelists.txt found.'
      );
      await commands.executeCommand(
        "setContext",
        ContextKeys.isPicoProject,
        false
      );
      const wantToImport = await window.showInformationMessage(
        "Do you want to import this project as Raspberry Pi Pico project?",
        "Yes",
        "No"
      );
      if (wantToImport === "Yes") {
        void commands.executeCommand(
          `${extensionName}.${IMPORT_PROJECT}`,
          workspaceFolder.uri
        );
      }

      return;
    }
  }

  await commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  if (isRustProject) {
    const vs = new VersionBundlesLoader(context.extensionUri);
    const latestSDK = await vs.getLatestSDK();
    if (!latestSDK) {
      Logger.error(
        LoggerSource.extension,
        "Failed to get latest Pico SDK version for Rust project."
      );
      void window.showErrorMessage(
        "Failed to get latest Pico SDK version for Rust project."
      );

      return;
    }

    const sdk = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title:
          "Downloading and installing latest Pico SDK (" +
          latestSDK +
          "). This may take a while...",
        cancellable: false,
      },
      async progress => {
        const result = await downloadAndInstallSDK(
          context.extensionUri,
          latestSDK,
          SDK_REPOSITORY_URL
        );

        progress.report({
          increment: 100,
        });

        if (!result) {
          installSuccess = false;

          Logger.error(
            LoggerSource.extension,
            "Failed to install latest SDK",
            `version: ${latestSDK}.`,
            "Make sure all requirements are met."
          );

          void window.showErrorMessage(
            "Failed to install latest SDK version for rust project."
          );

          return false;
        } else {
          Logger.info(
            LoggerSource.extension,
            "Found/installed latest SDK",
            `version: ${latestSDK}`
          );

          return true;
        }
      }
    );
    if (!sdk) {
      return;
    }

    const cargo = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Downloading and installing Rust. This may take a while...",
        cancellable: false,
      },
      async () => downloadAndInstallRust()
    );
    if (!cargo) {
      void window.showErrorMessage("Failed to install Rust.");

      return;
    }

    const result = await installLatestRustRequirements(context.extensionUri);

    if (!result) {
      return;
    }

    ui.showStatusBarItems(isRustProject);

    const chip = rustProjectGetSelectedChip(workspaceFolder.uri.fsPath);
    if (chip !== null) {
      ui.updateBoard(chip.toUpperCase());
    } else {
      ui.updateBoard("N/A");
    }

    return;
  }

  // get sdk selected in the project
  const selectedToolchainAndSDKVersions =
    await cmakeGetSelectedToolchainAndSDKVersions(workspaceFolder.uri);
  if (selectedToolchainAndSDKVersions === null) {
    return;
  }

  // get all available toolchains for download link of current selected one
  const toolchains = await getSupportedToolchains(context.extensionUri);
  const selectedToolchain = toolchains.find(
    toolchain => toolchain.version === selectedToolchainAndSDKVersions[1]
  );

  // TODO: for failed installation message add option to change version
  let installSuccess = true;
  // install if needed
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing Pico SDK as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallSDK(
        context.extensionUri,
        selectedToolchainAndSDKVersions[0],
        SDK_REPOSITORY_URL
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}.`,
          "Make sure all requirements are met."
        );

        void window.showErrorMessage("Failed to install project SDK version.");

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  if (selectedToolchain === undefined) {
    Logger.error(
      LoggerSource.extension,
      "Failed to detect project toolchain version."
    );

    void window.showErrorMessage("Failed to detect project toolchain version.");

    return;
  }

  let progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing toolchain as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallToolchain(
        selectedToolchain,
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project toolchain",
          `version: ${selectedToolchainAndSDKVersions[1]}`
        );

        void window.showErrorMessage(
          "Failed to install project toolchain version."
        );

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project toolchain",
          `version: ${selectedToolchainAndSDKVersions[1]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing tools as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallTools(
        selectedToolchainAndSDKVersions[0],
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;

        Logger.error(
          LoggerSource.extension,
          "Failed to install project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}.`,
          "Make sure all requirements are met."
        );

        void window.showErrorMessage("Failed to install project SDK version.");

        return;
      } else {
        Logger.info(
          LoggerSource.extension,
          "Found/installed project SDK",
          `version: ${selectedToolchainAndSDKVersions[0]}`
        );
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title:
        "Downloading and installing picotool as selected. " +
        "This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallPicotool(
        selectedToolchainAndSDKVersions[2],
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        installSuccess = false;
        Logger.error(LoggerSource.extension, "Failed to install picotool.");

        void window.showErrorMessage("Failed to install picotool.");

        return;
      } else {
        Logger.debug(LoggerSource.extension, "Found/installed picotool.");
      }
    }
  );

  if (!installSuccess) {
    return;
  }

  progressState = 0;
  await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: "Downloading and installing OpenOCD. This may take a while...",
      cancellable: false,
    },
    async progress => {
      const result = await downloadAndInstallOpenOCD(
        OPENOCD_VERSION,
        (prog: GotProgress) => {
          const percent = prog.percent * 100;
          progress.report({
            increment: percent - progressState,
          });
          progressState = percent;
        }
      );

      progress.report({
        increment: 100,
      });

      if (!result) {
        Logger.error(
          LoggerSource.extension,
          "Failed to download and install OpenOCD."
        );
        void window.showWarningMessage(
          "Failed to download and install OpenOCD."
        );
      } else {
        Logger.debug(LoggerSource.extension, "Found/installed OpenOCD.");

        void window.showInformationMessage(
          "OpenOCD found/installed successfully."
        );
      }
    }
  );

  // TODO: move this ninja, cmake and python installs out of extension.mts
  const ninjaPath = settings.getString(SettingsKey.ninjaPath);
  if (ninjaPath && ninjaPath.includes("/.pico-sdk/ninja")) {
    // check if ninja path exists
    if (!existsSync(ensureExe(ninjaPath.replace(HOME_VAR, homedir())))) {
      Logger.debug(
        LoggerSource.extension,
        "Ninja path in settings does not exist.",
        "Installing ninja to default path."
      );
      const ninjaVersion = /\/\.pico-sdk\/ninja\/([v.0-9]+)\//.exec(
        ninjaPath
      )?.[1];
      if (ninjaVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get ninja version from path in the settings."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      progressState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Ninja. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallNinja(
            ninjaVersion,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.error(LoggerSource.extension, "Failed to install ninja.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.debug(
        LoggerSource.extension,
        "Installed selected ninja for project."
      );
    }
  }

  const cmakePath = settings.getString(SettingsKey.cmakePath);
  if (cmakePath && cmakePath.includes("/.pico-sdk/cmake")) {
    // check if cmake path exists
    if (!existsSync(ensureExe(cmakePath.replace(HOME_VAR, homedir())))) {
      Logger.warn(
        LoggerSource.extension,
        "CMake path in settings does not exist.",
        "Installing CMake to default path."
      );

      const cmakeVersion = /\/\.pico-sdk\/cmake\/([v.0-9A-Za-z-]+)\//.exec(
        cmakePath
      )?.[1];
      if (cmakeVersion === undefined) {
        Logger.error(
          LoggerSource.extension,
          "Failed to get CMake version from path in the settings."
        );
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }

      let result = false;
      progressState = 0;
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing CMake. This may take a while...",
          cancellable: false,
        },
        async progress => {
          result = await downloadAndInstallCmake(
            cmakeVersion,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );
          progress.report({
            increment: 100,
          });
        }
      );

      if (!result) {
        Logger.error(LoggerSource.extension, "Failed to install CMake.");
        await commands.executeCommand(
          "setContext",
          ContextKeys.isPicoProject,
          false
        );

        return;
      }
      Logger.debug(
        LoggerSource.extension,
        "Installed selected cmake for project."
      );
    }
  }

  const pythonPath = await findPython();
  if (!pythonPath) {
    Logger.error(LoggerSource.extension, "Failed to find Python3 executable.");
    await commands.executeCommand(
      "setContext",
      ContextKeys.isPicoProject,
      false
    );
    showPythonNotFoundError();

    return;
  }

  ui.showStatusBarItems();
  ui.updateSDKVersion(selectedToolchainAndSDKVersions[0]);

  const selectedBoard = cmakeGetSelectedBoard(workspaceFolder.uri);
  if (selectedBoard !== null) {
    ui.updateBoard(selectedBoard);
  } else {
    ui.updateBoard("unknown");
  }

  // auto project configuration with cmake
  if (settings.getBoolean(SettingsKey.cmakeAutoConfigure)) {
    await cmakeSetupAutoConfigure(workspaceFolder, ui);
  } else if (settings.getBoolean(SettingsKey.useCmakeTools)) {
    // Ensure the Pico kit is selected
    await cmakeToolsForcePicoKit();
  } else {
    Logger.info(
      LoggerSource.extension,
      "No workspace folder for configuration found",
      "or cmakeAutoConfigure disabled."
    );
  }
}

async function cmakeSetupAutoConfigure(
  workspaceFolder: WorkspaceFolder,
  ui: UI
): Promise<void> {
  //run `cmake -G Ninja -B ./build ` in the root folder
  await configureCmakeNinja(workspaceFolder.uri);

  const ws = workspaceFolder.uri.fsPath;
  const cMakeCachePath = join(ws, "build", "CMakeCache.txt");
  const newBuildType = cmakeGetPicoVar(cMakeCachePath, "CMAKE_BUILD_TYPE");
  ui.updateBuildType(newBuildType ?? "unknown");

  workspace.onDidChangeTextDocument(event => {
    // Check if the changed document is the file you are interested in
    if (basename(event.document.fileName) === "CMakeLists.txt") {
      // File has changed, do something here
      // TODO: rerun configure project
      // TODO: maybe conflicts with cmake extension which also does this
      Logger.debug(
        LoggerSource.extension,
        "File changed:",
        event.document.fileName
      );
    }
  });
}

/**
 * Make sure the executable has the .exe extension on Windows.
 *
 * @param inp - The input string.
 * @returns The input string with .exe extension if on Windows.
 */
function ensureExe(inp: string): string {
  return process.platform === "win32"
    ? inp.endsWith(".exe")
      ? inp
      : `${inp}.exe`
    : inp;
}

export function deactivate(): void {
  // TODO: maybe await
  void commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  Logger.info(LoggerSource.extension, "Extension deactivated.");
}
