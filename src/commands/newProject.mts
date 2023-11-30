import { Command } from "./command.mjs";
import Logger from "../logger.mjs";
import { detectInstalledSDKs } from "../utils/picoSDKUtil.mjs";
import type Settings from "../settings.mjs";
import {
  checkForRequirements,
  showRequirementsNotMetErrorMessage,
} from "../utils/requirementsUtil.mjs";
import { compare } from "../utils/semverUtil.mjs";
import { ProgressLocation, type Uri, window } from "vscode";
import {
  detectInstalledToolchains,
  getSupportedToolchains,
} from "../utils/toolchainUtil.mjs";
import { SDK_REPOSITORY_URL, getSDKReleases } from "../utils/githubREST.mjs";
import {
  buildSDKPath,
  buildToolchainPath,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
} from "../utils/download.mjs";
import { NewProjectPanel } from "../webview/newProjectPanel.mjs";

export default class NewProjectCommand extends Command {
  private readonly _logger: Logger = new Logger("NewProjectCommand");
  private readonly _settings: Settings;
  private readonly _extensionUri: Uri;

  constructor(settings: Settings, extensionUri: Uri) {
    super("newProject");

    this._settings = settings;
    this._extensionUri = extensionUri;
  }

  private async selectSDKAndToolchain(): Promise<
    | {
        toolchainVersion: string;
        toolchainPath: string;
        sdkVersion: string;
        sdkPath: string;
      }
    | undefined
  > {
    const installedSDKs = detectInstalledSDKs();
    const installedToolchains = detectInstalledToolchains();

    try {
      if (installedSDKs.length === 0 || installedToolchains.length === 0) {
        // TODO: add offline handling
        const availableSDKs = await getSDKReleases();
        const supportedToolchains = await getSupportedToolchains();

        // show quick pick for sdk and toolchain
        const selectedSDK = await window.showQuickPick(
          availableSDKs.map(sdk => ({
            label: `v${sdk.tagName}`,
            sdk: sdk,
          })),
          {
            placeHolder: "Select Pico SDK version",
            title: "New Pico Project",
          }
        );

        if (selectedSDK === undefined) {
          return;
        }

        // show quick pick for toolchain version
        const selectedToolchain = await window.showQuickPick(
          supportedToolchains.map(toolchain => ({
            label: toolchain.version.replaceAll("_", "."),
            toolchain: toolchain,
          })),
          {
            placeHolder: "Select ARM Embeded Toolchain version",
            title: "New Pico Project",
          }
        );

        if (selectedToolchain === undefined) {
          return;
        }

        // show user feedback as downloads can take a while
        let installedSuccessfully = false;
        await window.withProgress(
          {
            location: ProgressLocation.Notification,
            title: "Downloading SDK and Toolchain",
            cancellable: false,
          },
          async progress => {
            // download both
            if (
              !(await downloadAndInstallSDK(
                selectedSDK.sdk.tagName,
                SDK_REPOSITORY_URL
              )) ||
              !(await downloadAndInstallToolchain(selectedToolchain.toolchain))
            ) {
              Logger.log(`Failed to download and install toolchain and SDK.`);

              progress.report({
                message:
                  "Failed to download and install toolchain and sdk. " +
                  "Make sure all requirements are met.",
                increment: 100,
              });

              installedSuccessfully = false;
            } else {
              installedSuccessfully = true;
            }
          }
        );

        if (!installedSuccessfully) {
          return;
        } else {
          return {
            toolchainVersion: selectedToolchain.toolchain.version,
            toolchainPath: buildToolchainPath(
              selectedToolchain.toolchain.version
            ),
            sdkVersion: selectedSDK.sdk.tagName,
            sdkPath: buildSDKPath(selectedSDK.sdk.tagName),
          };
        }
      }

      // sort installed sdks from newest to oldest
      installedSDKs.sort((a, b) =>
        compare(a.version.replace("v", ""), b.version.replace("v", ""))
      );
      // toolchains should be sorted and cant be sorted by compare because
      // of their alphanumeric structure

      return {
        toolchainVersion: installedToolchains[0].version,
        toolchainPath: installedToolchains[0].path,
        sdkVersion: installedSDKs[0].version,
        sdkPath: installedSDKs[0].sdkPath,
      };
    } catch (error) {
      Logger.log(
        `Error while retrieving SDK and toolchain versions: ${
          error instanceof Error ? error.message : (error as string)
        }`
      );

      void window.showErrorMessage(
        "Error while retrieving SDK and toolchain versions."
      );

      return;
    }
  }

  async execute(): Promise<void> {
    // check if all requirements are met
    const requirementsCheck = await checkForRequirements(this._settings);
    if (!requirementsCheck[0]) {
      void showRequirementsNotMetErrorMessage(requirementsCheck[1]);

      return;
    }

    // show webview
    await NewProjectPanel.createOrShow(this._settings, this._extensionUri);

    return;

    /*// TODO: maybe make it posible to also select a folder and
    // not always create a new one with selectedName
    const projectRoot: Uri[] | undefined = await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select project root",
    });

    // user focused out of the quick pick
    if (!projectRoot || projectRoot.length !== 1) {
      return;
    }

    // get project name
    const selectedName: string | undefined = await window.showInputBox({
      placeHolder: "Enter a project name",
      title: "New Pico Project",
    });

    // user focused out of the quick pick
    if (!selectedName) {
      return;
    }

    // get board type (single selection)
    const selectedBoardType: BoardType | undefined =
      (await window.showQuickPick(Object.values(BoardType), {
        placeHolder: "Select a board type",
        title: "New Pico Project",
      })) as BoardType | undefined;

    // user focused out of the quick pick
    if (!selectedBoardType) {
      return;
    }

    // [optional] get console options (multi selection)
    const selectedConsoleOptions: ConsoleOption[] | undefined =
      (await window.showQuickPick(Object.values(ConsoleOption), {
        placeHolder: "Would you like to enable the USB console?",
        title: "New Pico Project",
        canPickMany: true,
      })) as ConsoleOption[] | undefined;

    // user focused out of the quick pick
    if (!selectedConsoleOptions) {
      return;
    }

    // [optional] get libraries (multi selection)
    const selectedFeatures: Array<Library | PicoWirelessOption> | undefined =
      (await window.showQuickPick(Object.values(Library), {
        placeHolder: "Select libraries to include",
        title: "New Pico Project",
        canPickMany: true,
      })) as Library[] | undefined;

    // user focused out of the quick pick
    if (!selectedFeatures) {
      return;
    }

    if (selectedBoardType === BoardType.picoW) {
      const selectedWirelessFeature: PicoWirelessOption | undefined =
        (await window.showQuickPick(Object.values(PicoWirelessOption), {
          placeHolder:
            "Select wireless features to include or press enter to skip",
          title: "New Pico Project",
          canPickMany: false,
        })) as PicoWirelessOption | undefined;

      // user focused out of the quick pick
      if (!selectedWirelessFeature) {
        return;
      }

      if (
        selectedWirelessFeature &&
        selectedWirelessFeature !== PicoWirelessOption.none
      ) {
        selectedFeatures.push(selectedWirelessFeature);
      }
    }

    const selectedCodeOptions: CodeOption[] | undefined =
      (await window.showQuickPick(Object.values(CodeOption), {
        placeHolder: "Select code generator options to use",
        title: "New Pico Project",
        canPickMany: true,
      })) as CodeOption[] | undefined;

    if (!selectedCodeOptions) {
      return;
    }

    const selectedDebugger: Debugger | undefined = (await window.showQuickPick(
      Object.values(Debugger),
      {
        placeHolder: "Select debugger to use",
        title: "New Pico Project",
        canPickMany: false,
      }
    )) as Debugger | undefined;

    if (!selectedDebugger) {
      return;
    }

    const selectedToolchainAndSDK = await this.selectSDKAndToolchain();

    if (selectedToolchainAndSDK === undefined) {
      return;
    }

    void window.showWarningMessage(
      "Generating project, this may take a while..."
    );

    await this.executePicoProjectGenerator({
      name: selectedName,
      projectRoot: projectRoot[0].fsPath,
      boardType: selectedBoardType,
      consoleOptions: selectedConsoleOptions,
      libraries: selectedFeatures,
      codeOptions: selectedCodeOptions,
      debugger: selectedDebugger,
      toolchainAndSDK: selectedToolchainAndSDK,
    }); */
  }
}
