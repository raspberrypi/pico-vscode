import { Command } from "./command.mjs";
import {
  ProgressLocation,
  type Uri,
  window,
  workspace,
  commands,
} from "vscode";
import type UI from "../ui.mjs";
import { updateVSCodeStaticConfigs } from "../utils/vscodeConfigUtil.mjs";
import {
  SDK_REPOSITORY_URL,
  getCmakeReleases,
  getNinjaReleases,
  getSDKReleases,
} from "../utils/githubREST.mjs";
import {
  downloadAndInstallCmake,
  downloadAndInstallNinja,
  downloadAndInstallSDK,
  downloadAndInstallToolchain,
  downloadAndInstallTools,
} from "../utils/download.mjs";
import { cmakeUpdateSDK } from "../utils/cmakeUtil.mjs";
import {
  type SupportedToolchainVersion,
  getSupportedToolchains,
} from "../utils/toolchainUtil.mjs";
import which from "which";
import VersionBundlesLoader, {
  type VersionBundle,
} from "../utils/versionBundles.mjs";
import { sep } from "path";
import { join as posixJoin } from "path/posix";
import { NINJA_AUTO_INSTALL_DISABLED } from "../webview/newProjectPanel.mjs";
import Logger from "../logger.mjs";
import type { Progress as GotProgress } from "got";

export interface AdvancedSwitchSDKOptions {
  toolchainVersion: { label: string; toolchain: SupportedToolchainVersion };
  cmakeVersion: string;
  ninjaVersion?: string;
}

interface SwitchSDKOptions {
  sdkVersion: string;
  advancedOptions?: AdvancedSwitchSDKOptions;
}

export default class SwitchSDKCommand extends Command {
  private _versionBundlesLoader: VersionBundlesLoader;
  private _logger: Logger = new Logger("SwitchSDKCommand");

  public static readonly id = "switchSDK";

  constructor(private readonly _ui: UI, extensionUri: Uri) {
    super(SwitchSDKCommand.id);

    this._versionBundlesLoader = new VersionBundlesLoader(extensionUri);
  }

  // TODO: maybe move into UI helper file or something
  public static async askCmakeVersion(
    versionBundleAvailable: boolean
  ): Promise<string | undefined> {
    const cmakeVersions = await getCmakeReleases();
    const quickPickItems = ["Specific version", "Custom path"];
    if (versionBundleAvailable) {
      quickPickItems.unshift("Default");
    }
    if (await SwitchSDKCommand.isSystemCMakeAvailable()) {
      quickPickItems.push("Use system CMake");
    }

    if (cmakeVersions.length === 0) {
      void window.showErrorMessage(
        "Failed to get CMake releases. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    // show quick pick for cmake version
    const selectedCmakeVersion = await window.showQuickPick(quickPickItems, {
      placeHolder: "Select CMake version",
    });

    if (selectedCmakeVersion === undefined) {
      return;
    }

    switch (selectedCmakeVersion) {
      case quickPickItems[0]:
        return "Default";
      case quickPickItems[1]: {
        // show quick pick for cmake version
        const selectedCmakeVersion = await window.showQuickPick(cmakeVersions, {
          placeHolder: "Select CMake version",
        });

        if (selectedCmakeVersion === undefined) {
          return;
        }

        return selectedCmakeVersion;
      }
      case quickPickItems[2]:
        return "cmake";
      case quickPickItems[3]: {
        const cmakeExePath = await window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: "Select",
          title: "Select a cmake executable to use for this project",
        });

        if (cmakeExePath && cmakeExePath[0]) {
          return posixJoin(...cmakeExePath[0].fsPath.split(sep));
        }

        return;
      }
    }
  }

  // TODO: maybe move into UI helper file or something
  public static async askNinjaVersion(
    versionBundleAvailable: boolean
  ): Promise<string | undefined> {
    const ninjaVersions = await getNinjaReleases();
    const quickPickItems = ["Specific version", "Custom path"];
    if (versionBundleAvailable) {
      quickPickItems.unshift("Default");
    }
    if (await SwitchSDKCommand.isSystemNinjaAvailable()) {
      quickPickItems.push("Use system Ninja");
    }

    if (ninjaVersions.length === 0) {
      void window.showErrorMessage(
        "Failed to get Ninja releases. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    // show quick pick for ninja version
    const selectedNinjaVersion = await window.showQuickPick(quickPickItems, {
      placeHolder: "Select Ninja version",
    });

    if (selectedNinjaVersion === undefined) {
      return;
    }

    switch (selectedNinjaVersion) {
      case quickPickItems[0]:
        return "Default";
      case quickPickItems[1]: {
        // show quick pick for ninja version
        const selectedNinjaVersion = await window.showQuickPick(ninjaVersions, {
          placeHolder: "Select Ninja version",
        });

        if (selectedNinjaVersion === undefined) {
          return;
        }

        return selectedNinjaVersion;
      }
      case quickPickItems[2]:
        return "ninja";
      case quickPickItems[3]: {
        const ninjaExePath = await window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: "Select",
          title: "Select a cmake executable to use for this project",
        });

        if (ninjaExePath && ninjaExePath[0]) {
          return posixJoin(...ninjaExePath[0].fsPath.split(sep));
        }

        return;
      }
    }
  }

  public static async askToolchainVersion(
    supportedToolchainVersions: SupportedToolchainVersion[]
  ): Promise<
    { label: string; toolchain: SupportedToolchainVersion } | undefined
  > {
    let selectedToolchainVersion:
      | { label: string; toolchain: SupportedToolchainVersion }
      | undefined;

    try {
      // show quick pick for toolchain version
      selectedToolchainVersion = await window.showQuickPick(
        supportedToolchainVersions.map(toolchain => ({
          label: toolchain.version.replaceAll("_", "."),
          toolchain: toolchain,
        })),
        {
          placeHolder: "Select ARM/RISCV Embeded Toolchain version",
        }
      );
    } catch {
      void window.showErrorMessage(
        "Failed to get supported toolchain versions. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    return selectedToolchainVersion;
  }

  public static async askSDKVersion(): Promise<
    { label: string; sdk: string } | undefined
  > {
    const sdks = await getSDKReleases();

    if (sdks.length === 0) {
      void window.showErrorMessage(
        "Failed to get SDK releases. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    // TODO: split sdk versions with version bundle and without
    // show quick pick
    const selectedSDK = await window.showQuickPick(
      sdks.map(sdk => ({
        label: `v${sdk}`,
        sdk: sdk,
      })),
      {
        placeHolder: "Select SDK version",
      }
    );

    return selectedSDK;
  }

  public static async isSystemNinjaAvailable(): Promise<boolean> {
    return (await which("ninja", { nothrow: true })) !== null;
  }

  public static async isSystemCMakeAvailable(): Promise<boolean> {
    return (await which("cmake", { nothrow: true })) !== null;
  }

  /**
   * Asks the user for advanced options.
   *
   * @param supportedToolchainVersions A list of supported toolchain versions the user can
   * choose from.
   * @param versionBundle The version bundle of the selected SDK version (if available).
   * @returns The advanced options or undefined if the user canceled.
   */
  public static async getAdvancedOptions(
    supportedToolchainVersions: SupportedToolchainVersion[],
    versionBundle?: VersionBundle
  ): Promise<AdvancedSwitchSDKOptions | undefined> {
    const toolchainVersion = await SwitchSDKCommand.askToolchainVersion(
      supportedToolchainVersions
    );
    if (toolchainVersion === undefined) {
      return;
    }

    const cmakeVersion = await SwitchSDKCommand.askCmakeVersion(
      versionBundle !== undefined
    );
    if (cmakeVersion === undefined) {
      return;
    }

    let ninjaVersion: string | undefined;
    if (!NINJA_AUTO_INSTALL_DISABLED) {
      ninjaVersion = await SwitchSDKCommand.askNinjaVersion(
        versionBundle !== undefined
      );
      if (ninjaVersion === undefined) {
        return;
      }
    }

    return {
      toolchainVersion: toolchainVersion,
      cmakeVersion:
        cmakeVersion === "Default" ? versionBundle?.cmake : cmakeVersion,
      ninjaVersion:
        ninjaVersion === "Default" ? versionBundle?.ninja : ninjaVersion,
    } as AdvancedSwitchSDKOptions;
  }

  async execute(): Promise<void> {
    if (
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0
    ) {
      void window.showErrorMessage("Please open a Pico project folder first.");

      return;
    }

    const workspaceFolder = workspace.workspaceFolders[0];

    const selectedSDK = await SwitchSDKCommand.askSDKVersion();

    if (selectedSDK === undefined) {
      return;
    }
    const options: SwitchSDKOptions = {
      sdkVersion: selectedSDK.label,
    };
    const versionBundle = await this._versionBundlesLoader.getModuleVersion(
      selectedSDK.label.replace("v", "")
    );

    const selectedPicotool = versionBundle?.picotool;

    const configureAdvancedOptions = await window.showQuickPick(["No", "Yes"], {
      title: "Switch Tools",
      placeHolder: "Configure advanced options?",
    });

    if (configureAdvancedOptions === undefined) {
      return;
    }

    const supportedToolchainVersions = await getSupportedToolchains();

    if (supportedToolchainVersions.length === 0) {
      // internet is not required if locally cached version bundles are available
      // but in this case a use shouldn't see this message
      void window.showErrorMessage(
        "Failed to get supported toolchain versions. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    // TODO: || versionBundle === undefined
    if (configureAdvancedOptions === "Yes") {
      const advancedOptions = await SwitchSDKCommand.getAdvancedOptions(
        supportedToolchainVersions,
        versionBundle
      );

      if (advancedOptions === undefined) {
        return;
      }
      options.advancedOptions = advancedOptions;
    }

    const selectedToolchain =
      configureAdvancedOptions === "No"
        ? versionBundle?.toolchain !== undefined &&
          supportedToolchainVersions.find(
            t => t.version === versionBundle?.toolchain
          ) !== undefined
          ? {
              label: versionBundle?.toolchain.replaceAll("_", "."),
              toolchain: supportedToolchainVersions.find(
                t => t.version === versionBundle?.toolchain
              )!,
            }
          : {
              label: supportedToolchainVersions[0].version.replaceAll("_", "."),
              toolchain: supportedToolchainVersions[0],
            }
        : // if configureAdvancedOptions is not "No" then
          //options.advancedOptions is defined
          options.advancedOptions!.toolchainVersion;

    // show individual progress bars while installing
    let result = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Installing SDK...",
        cancellable: false,
      },
      async progress => {
        // download and install selected SDK
        // TODO: maybe parse python3 path
        const result = await downloadAndInstallSDK(
          selectedSDK.sdk,
          SDK_REPOSITORY_URL
        );

        if (result) {
          this._logger.debug("Successfully installed SDK.");

          progress.report({
            increment: 100,
            // TODO: maybe only finished or sth like that
            message: `Successfully installed SDK ${selectedSDK.label}.`,
          });

          return true;
        }

        this._logger.error("Failed to install SDK.");

        progress.report({
          increment: 100,
        });

        void window.showErrorMessage(
          `Failed to install SDK ${selectedSDK.label}. ` +
            "Make sure all requirements are met."
        );

        return false;
      }
    );

    if (!result) {
      return;
    }

    let progressState = 0;
    result = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Installing toolchain...",
        cancellable: false,
      },
      async progress => {
        // download and install selected toolchain
        const result = await downloadAndInstallToolchain(
          selectedToolchain.toolchain,
          (prog: GotProgress) => {
            const percent = prog.percent * 100;
            progress.report({
              increment: percent - progressState,
            });
            progressState = percent;
          }
        );

        if (result) {
          this._logger.debug("Successfully installed toolchain.");

          progress.report({
            increment: 100,
            message:
              "Successfully installed " +
              `toolchain ${selectedToolchain.label}.`,
          });

          return true;
        }

        this._logger.error("Failed to install toolchain.");

        progress.report({
          increment: 100,
        });

        void window.showErrorMessage(
          `Failed to install toolchain ${selectedToolchain.label}.`
        );

        return false;
      }
    );

    if (!result) {
      return;
    }

    progressState = 0;
    result = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Installing tools...",
        cancellable: false,
      },
      async progress => {
        // download and install tools
        const result = await downloadAndInstallTools(
          selectedSDK.sdk,
          (prog: GotProgress) => {
            const percent = prog.percent * 100;
            progress.report({
              increment: percent - progressState,
            });
            progressState = percent;
          }
        );

        if (result) {
          this._logger.debug("Successfully installed tools.");

          progress.report({
            increment: 100,
            message: "Successfully installed tools.",
          });

          return true;
        }

        this._logger.error("Failed to install tools.");

        progress.report({
          increment: 100,
        });

        void window.showErrorMessage("Failed to install tools.");

        return false;
      }
    );

    if (!result) {
      return;
    }

    if (options.advancedOptions?.ninjaVersion !== undefined) {
      progressState = 0;
      result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing Ninja...",
          cancellable: false,
        },
        async progress => {
          const result = await downloadAndInstallNinja(
            options.advancedOptions!.ninjaVersion!,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );

          if (result) {
            progress.report({
              increment: 100,
              message: "Successfully installed Ninja.",
            });

            return true;
          }

          progress.report({
            increment: 100,
          });

          void window.showWarningMessage("Failed to install Ninja.");

          return false;
        }
      );

      if (!result) {
        return;
      }
    } else {
      // TODO: maybe show error
      /*
      this._logger.error("Advanced options are undefined.");

        void window.showErrorMessage("Failed to get Ninja version.");

        return;
        */
    }

    // TODO: check if not version bundle check here would be better
    /* compare with ninja checks
    options.advancedOptions?.cmakeVersion !== undefined &&
              !options.advancedOptions.cmakeVersion.includes("/") &&
              options.advancedOptions.cmakeVersion !== "cmake" &&
              (await downloadAndInstallCmake(
                options.advancedOptions.cmakeVersion
              ))*/
    if (
      options.advancedOptions?.cmakeVersion !== undefined &&
      !options.advancedOptions.cmakeVersion.includes("/") &&
      options.advancedOptions.cmakeVersion !== "cmake"
    ) {
      progressState = 0;
      result = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Downloading and installing CMake...",
          cancellable: false,
        },
        async progress => {
          const result = await downloadAndInstallCmake(
            options.advancedOptions!.cmakeVersion,
            (prog: GotProgress) => {
              const percent = prog.percent * 100;
              progress.report({
                increment: percent - progressState,
              });
              progressState = percent;
            }
          );

          if (result) {
            this._logger.debug("Successfully installed CMake.");

            progress.report({
              increment: 100,
            });

            void window.showInformationMessage("Successfully installed CMake.");

            return true;
          }

          this._logger.error("Failed to install CMake.");

          progress.report({
            increment: 100,
          });

          void window.showWarningMessage("Failed to install CMake.");

          return false;
        }
      );

      if (!result) {
        return;
      }
    }

    result = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Updating project configuration...",
        cancellable: false,
      },
      async progress => {
        await updateVSCodeStaticConfigs(
          workspaceFolder.uri.fsPath,
          selectedSDK.sdk,
          selectedToolchain.toolchain.version,
          options.advancedOptions?.ninjaVersion,
          options.advancedOptions?.cmakeVersion
        );

        progress.report({
          increment: 50,
          message: "Project configuration updated.",
        });

        const cmakeUpdateResult = await cmakeUpdateSDK(
          workspaceFolder.uri,
          selectedSDK.sdk,
          selectedToolchain.toolchain.version,
          selectedPicotool ?? "2.1.0"
        );

        progress.report({
          increment: 50,
          message: "CMakeLists.txt updated.",
        });

        if (!cmakeUpdateResult) {
          void window.showWarningMessage(
            "Failed to update CMakeLists.txt for new SDK version."
          );

          return false;
        }

        return true;
      }
    );

    if (result) {
      this._ui.updateSDKVersion(selectedSDK.label.replace("v", ""));

      const reloadWindowBtn = "Reload Window";
      // notify user that reloading the window is
      // recommended to update intellisense
      const reload = await window.showInformationMessage(
        "It is recommended to reload the window to update intellisense " +
          "with the new SDK version.",
        reloadWindowBtn
      );

      if (reload === reloadWindowBtn) {
        void commands.executeCommand("workbench.action.reloadWindow");
      }
    }
  }
}
