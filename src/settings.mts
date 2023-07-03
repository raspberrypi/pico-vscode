import type { Memento, WorkspaceConfiguration } from "vscode";
import { extensions, workspace } from "vscode";

export enum SettingsKey {
  picoSDK = "sdk",
  picoSDKPath = "sdkPath",
  toolchainPath = "toolchainPath",
  cmakePath = "cmakePath",
  pythonPath = "pythonPath",
  ninjaPath = "ninjaPath",
}

export type Setting = string | boolean | string[] | null | undefined;

export interface PackageJSON {
  name: string;
  publisher: string;
}

const pkg: PackageJSON | undefined = extensions.getExtension(
  "paulober.raspberry-pi-pico"
)?.packageJSON as PackageJSON;

export default class Settings {
  private config: WorkspaceConfiguration;
  public context: Memento;
  private pkg: PackageJSON;

  constructor(context: Memento, packageJSON: PackageJSON) {
    this.config = workspace.getConfiguration("raspberry-pi-pico");

    this.context = context;
    this.pkg = packageJSON;
  }

  public get(key: SettingsKey): Setting {
    return this.config.get(key);
  }

  public getString(key: SettingsKey): string | undefined {
    const value = this.get(key);

    return typeof value === "string" ? value : undefined;
  }

  public getBoolean(key: SettingsKey): boolean | undefined {
    const value = this.get(key);

    return typeof value === "boolean" ? value : undefined;
  }

  public getArray(key: SettingsKey): string[] | undefined {
    const value = this.get(key);

    return Array.isArray(value) ? value : undefined;
  }

  public update<T>(key: SettingsKey, value: T): Thenable<void> {
    return this.config.update(key, value, true);
  }

  // helpers
}

export function getExtensionName(): string | undefined {
  return pkg?.name;
}

export function getExtensionId(): string {
  return [pkg?.publisher, pkg?.name].join(".");
}
