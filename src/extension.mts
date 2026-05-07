import {
  workspace,
  type ExtensionContext,
  window,
  type WebviewPanel,
  commands,
} from "vscode";
import {
  extensionName,
  type Command,
  type CommandWithArgs,
  type CommandWithResult,
} from "./commands/command.mjs";
import NewProjectCommand from "./commands/newProject.mjs";
import Logger, { LoggerSource } from "./logger.mjs";
import Settings, { type PackageJSON } from "./settings.mjs";
import UI from "./ui.mjs";
import SwitchSDKCommand from "./commands/switchSDK.mjs";
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
  GetGitPathCommand,
} from "./commands/getPaths.mjs";
import { NewProjectPanel } from "./webview/newProjectPanel.mjs";
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
import NewExampleProjectCommand from "./commands/newExampleProject.mjs";
import SwitchBoardCommand from "./commands/switchBoard.mjs";
import UninstallPicoSDKCommand from "./commands/uninstallPicoSDK.mjs";
import UpdateOpenOCDCommand from "./commands/updateOpenOCD.mjs";
import FlashProjectSWDCommand from "./commands/flashProjectSwd.mjs";
// eslint-disable-next-line max-len
import { NewMicroPythonProjectPanel } from "./webview/newMicroPythonProjectPanel.mjs";
import State from "./state.mjs";
import { NewRustProjectPanel } from "./webview/newRustProjectPanel.mjs";
import { IMPORT_PROJECT } from "./commands/cmdIds.mjs";
import { NewZephyrProjectPanel } from "./webview/newZephyrProjectPanel.mjs";
import LastUsedDepsStore from "./utils/lastUsedDeps.mjs";
import { getWebviewOptions } from "./webview/sharedFunctions.mjs";
import { UninstallerPanel } from "./webview/uninstallerPanel.mjs";
import OpenUninstallerCommand from "./commands/openUninstaller.mjs";
import { CleanZephyrCommand } from "./commands/cleanZephyr.mjs";
import { createProjectVariantRegistry } from "./projectVariants/index.mjs";
import { setProjectContext } from "./projectVariants/common.mjs";

export async function activate(context: ExtensionContext): Promise<void> {
  Logger.info(LoggerSource.extension, "Extension activation triggered");

  const settings = Settings.createInstance(
    context.workspaceState,
    context.globalState,
    context.extension.packageJSON as PackageJSON
  );
  GithubApiCache.createInstance(context);
  LastUsedDepsStore.instance.setup(context.globalState);

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
    new OpenUninstallerCommand(context.extensionUri),
    new GetGitPathCommand(settings),
    new CleanZephyrCommand(),
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
    window.registerWebviewPanelSerializer(UninstallerPanel.viewType, {
      // eslint-disable-next-line @typescript-eslint/require-await
      async deserializeWebviewPanel(webviewPanel: WebviewPanel): Promise<void> {
        // Reset the webview options so we use latest uri for `localResourceRoots`.
        webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
        UninstallerPanel.revive(webviewPanel, context.extensionUri);
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
  if (workspaceFolder === undefined) {
    Logger.warn(LoggerSource.extension, "No workspace folder found.");
    await setProjectContext({
      isPicoProject: false,
      isRustProject: false,
      isZephyrProject: false,
    });

    return;
  }

  const registry = createProjectVariantRegistry();
  const detection = await registry.detect(workspaceFolder);
  if (detection.kind === "unsupported") {
    Logger.warn(LoggerSource.extension, detection.reason);
    await setProjectContext({
      isPicoProject: false,
      isRustProject: false,
      isZephyrProject: false,
    });
    State.getInstance().isRustProject = false;
    State.getInstance().isZephyrProject = false;

    if (detection.offerImport) {
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
    }

    return;
  }

  const variant = registry.get(detection.variant);
  await setProjectContext(variant.context);
  State.getInstance().isRustProject = variant.context.isRustProject;
  State.getInstance().isZephyrProject = variant.context.isZephyrProject;

  const selections = await variant.readSelections(workspaceFolder);
  if (selections === null) {
    return;
  }

  const dependenciesReady = await variant.ensureDependencies({
    context,
    folder: workspaceFolder,
    selections,
    settings,
  });
  if (!dependenciesReady) {
    return;
  }

  await variant.updateUi({ ui, selections });

  const activated =
    (await variant.afterActivation?.({
      context,
      folder: workspaceFolder,
      selections,
      settings,
      ui,
    })) ?? true;
  if (!activated) {
    return;
  }
}

export function deactivate(): void {
  // TODO: maybe await
  void commands.executeCommand("setContext", ContextKeys.isPicoProject, true);

  Logger.info(LoggerSource.extension, "Extension deactivated.");
}
