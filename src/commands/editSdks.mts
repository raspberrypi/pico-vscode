import { window } from "vscode";
import Logger from "../logger.mjs";
import { Command } from "./command.mjs";
import UnixSDKManager, {
  type SDKPaths,
  type UnixConfig,
} from "../utils/picoSDKUnixUtil.mjs";
import { join } from "path";
import { existsSync } from "fs";

export default class EditSDKsCommand extends Command {
  private _logger: Logger = new Logger("EditSDKsCommand");

  constructor() {
    super("editSDKs");
  }

  private async getSDKProperties(title: string): Promise<SDKPaths | undefined> {
    const sdkPathUri = await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select SDK path",
      title,
    });

    if (sdkPathUri === undefined || sdkPathUri.length === 0) {
      return;
    }

    // validate sdk path
    const cmakeInitPath = join(sdkPathUri[0].fsPath, "pico_sdk_init.cmake");
    if (!existsSync(cmakeInitPath)) {
      void window.showErrorMessage(
        "Selected SDK path does not contain pico_sdk_init.cmake file."
      );

      return;
    }

    const toolchainUri = await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select toolchain path",
      title,
    });

    if (toolchainUri === undefined || toolchainUri.length === 0) {
      return;
    }

    // validate toolchain path
    const toolchainPath = join(
      toolchainUri[0].fsPath,
      process.platform === "win32"
        ? "arm-none-eabi-gcc.exe"
        : "arm-none-eabi-gcc"
    );
    if (!existsSync(toolchainPath)) {
      void window.showErrorMessage(
        "Selected toolchain path does not contain arm-none-eabi-gcc file."
      );

      return;
    }

    return {
      picoSDKPath: sdkPathUri[0].fsPath,
      toolchainPath: toolchainUri[0].fsPath,
    };
  }

  async execute(): Promise<void> {
    this._logger.debug("Executing editSDKs command.");

    const option = await window.showQuickPick(
      ["Add SDK", "Remove SDK", "Edit SDK"],
      {
        placeHolder: "Select an option",
        canPickMany: false,
        ignoreFocusOut: false,
        title: "Edit SDKs",
      }
    );

    if (option === undefined) {
      return;
    }

    const config =
      UnixSDKManager.loadConfig() ??
      ({
        sdks: {},
      } as UnixConfig);
    const sdkVersions = Object.keys(config.sdks);
    let version: string | undefined, properties: SDKPaths | undefined;

    switch (option) {
      case "Add SDK":
        this._logger.debug("Add SDK selected.");

        //get version, sdk path selecter and toolchain path selector
        version = await window.showInputBox({
          placeHolder: "Enter SDK version (e.g. 1.2.3)",
          ignoreFocusOut: true,
          title: "Add SDK",
        });

        if (version === undefined) {
          return;
        }

        properties = await this.getSDKProperties("Add SDK");

        if (properties === undefined) {
          return;
        }

        config.sdks[version] = properties;

        break;
      case "Remove SDK":
        this._logger.debug("Remove SDK selected.");

        if (sdkVersions.length === 0) {
          void window.showErrorMessage("No SDKs found.");

          return;
        }

        version = await window.showQuickPick(sdkVersions, {
          placeHolder: "Select SDK version",
          canPickMany: false,
          ignoreFocusOut: false,
          title: "Remove SDK",
        });

        if (version === undefined) {
          return;
        }

        delete config.sdks[version];

        break;
      case "Edit SDK":
        this._logger.debug("Edit SDK selected.");

        if (sdkVersions.length === 0) {
          void window.showErrorMessage("No SDKs found.");

          return;
        }

        version = await window.showQuickPick(sdkVersions, {
          placeHolder: "Select SDK version",
          canPickMany: false,
          ignoreFocusOut: false,
          title: "Edit SDK",
        });

        if (version === undefined) {
          return;
        }

        properties = await this.getSDKProperties("Edit SDK");

        if (properties === undefined) {
          return;
        }

        config.sdks[version] = properties;

        break;
      default:
        this._logger.error(`Unknown option: ${option}`);
        break;
    }

    UnixSDKManager.saveConfig(config);
  }
}
