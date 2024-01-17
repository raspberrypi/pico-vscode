import { Command } from "./command.mjs";
import { ProgressLocation, type Uri, window, workspace } from "vscode";
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

interface AdvancedSwitchSDKOptions {
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

  public static readonly id = "switchSDK";

  constructor(private readonly _ui: UI, extensionUri: Uri) {
    super(SwitchSDKCommand.id);

    this._versionBundlesLoader = new VersionBundlesLoader(extensionUri);
  }

  private async askCmakeVersion(
    versionBundleAvailable: boolean
  ): Promise<string | undefined> {
    const cmakeVersions = await getCmakeReleases();
    const quickPickItems = ["Specific version", "Custom path"];
    if (versionBundleAvailable) {
      quickPickItems.unshift("Default");
    }
    if (await this._isSystemCMakeAvailable()) {
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

  private async askNinjaVersion(
    versionBundleAvailable: boolean
  ): Promise<string | undefined> {
    const ninjaVersions = await getNinjaReleases();
    const quickPickItems = ["Specific version", "Custom path"];
    if (versionBundleAvailable) {
      quickPickItems.unshift("Default");
    }
    if (await this._isSystemNinjaAvailable()) {
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

  private async askToolchainVersion(
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
          placeHolder: "Select ARM Embeded Toolchain version",
        }
      );
    } catch (error) {
      void window.showErrorMessage(
        "Failed to get supported toolchain versions. " +
          "Make sure you are connected to the internet."
      );

      return;
    }

    return selectedToolchainVersion;
  }

  private async _isSystemNinjaAvailable(): Promise<boolean> {
    return (await which("ninja", { nothrow: true })) !== null;
  }

  private async _isSystemCMakeAvailable(): Promise<boolean> {
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
  private async _getAdvancedOptions(
    supportedToolchainVersions: SupportedToolchainVersion[],
    versionBundle?: VersionBundle
  ): Promise<AdvancedSwitchSDKOptions | undefined> {
    const toolchainVersion = await this.askToolchainVersion(
      supportedToolchainVersions
    );
    if (toolchainVersion === undefined) {
      return;
    }

    const cmakeVersion = await this.askCmakeVersion(
      versionBundle !== undefined
    );
    if (cmakeVersion === undefined) {
      return;
    }

    let ninjaVersion: string | undefined;
    if (!NINJA_AUTO_INSTALL_DISABLED) {
      ninjaVersion = await this.askNinjaVersion(versionBundle !== undefined);
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

    if (selectedSDK === undefined) {
      return;
    }
    const options: SwitchSDKOptions = {
      sdkVersion: selectedSDK.label,
    };
    const versionBundle = await this._versionBundlesLoader.getModuleVersion(
      selectedSDK.label.replace("v", "")
    );

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
      const advancedOptions = await this._getAdvancedOptions(
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

    // show progress bar while installing
    const result = await window.withProgress(
      {
        title:
          `Installing SDK ${selectedSDK.label}, ` +
          `toolchain ${selectedToolchain.label} ` +
          "and tools...",
        location: ProgressLocation.Notification,
      },
      async progress => {
        // download and install selected SDK
        if (
          (await downloadAndInstallSDK(selectedSDK.sdk, SDK_REPOSITORY_URL)) &&
          (await downloadAndInstallTools(
            selectedSDK.sdk,
            process.platform === "win32"
          ))
        ) {
          progress.report({
            increment: 40,
          });

          if (await downloadAndInstallToolchain(selectedToolchain.toolchain)) {
            progress.report({
              increment: 20,
            });

            if (
              options.advancedOptions?.ninjaVersion !== undefined &&
              (await downloadAndInstallNinja(
                options.advancedOptions.ninjaVersion
              ))
            ) {
              progress.report({
                increment: 10,
              });
            }

            // install if cmakeVersion is not a path and not a command
            if (
              options.advancedOptions?.cmakeVersion !== undefined &&
              !options.advancedOptions.cmakeVersion.includes("/") &&
              options.advancedOptions.cmakeVersion !== "cmake" &&
              (await downloadAndInstallCmake(
                options.advancedOptions.cmakeVersion
              ))
            ) {
              progress.report({
                increment: 10,
              });
            }

            await updateVSCodeStaticConfigs(
              workspaceFolder.uri.fsPath,
              selectedSDK.sdk,
              selectedToolchain.toolchain.version,
              options.advancedOptions?.ninjaVersion,
              options.advancedOptions?.cmakeVersion
            );

            progress.report({
              increment: 10,
            });

            await cmakeUpdateSDK(
              workspaceFolder.uri,
              selectedSDK.sdk,
              selectedToolchain.toolchain.version
            );

            progress.report({
              // show sdk installed notification
              message: `Successfully installed SDK ${selectedSDK.label}.`,
              increment: 10,
            });

            return true;
          } else {
            progress.report({
              message:
                "Failed to install " + `toolchain ${selectedToolchain.label}.`,
              increment: 60,
            });

            return false;
          }
        }

        progress.report({
          // show sdk install failed notification
          message:
            `Failed to install SDK ${selectedSDK.label}.` +
            "Make sure all requirements are met.",
          increment: 100,
        });

        return false;
      }
    );

    if (result) {
      this._ui.updateSDKVersion(selectedSDK.label.replace("v", ""));
    }
  }
}
