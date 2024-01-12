import type { Memento, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

/**
 * SettingsKey is a list of all settings keys added by this extension (with the extension prefix).
 */
export enum SettingsKey {
  cmakePath = "cmakePath",
  python3Path = "python3Path",
  ninjaPath = "ninjaPath",
  gitPath = "gitPath",
  cmakeAutoConfigure = "cmakeAutoConfigure",
  githubToken = "githubToken",
}

/**
 * HOME_VAR is a placeholder for the home directory of the current user
 * that the extension must replace when loading paths from settings.
 */
export const HOME_VAR = "${HOME}";

export type Setting = string | boolean | string[] | null | undefined;

export interface PackageJSON {
  name: string;
  publisher: string;
}

export default class Settings {
  private static instance?: Settings;
  private config: WorkspaceConfiguration;
  public context: Memento;
  private pkg: PackageJSON;

  private constructor(context: Memento, packageJSON: PackageJSON) {
    this.context = context;
    this.pkg = packageJSON;

    this.config = workspace.getConfiguration(packageJSON.name);
  }

  public static createInstance(
    context: Memento,
    packageJSON: PackageJSON
  ): Settings {
    Settings.instance = new Settings(context, packageJSON);

    return Settings.instance;
  }

  public static getInstance(): Settings | undefined {
    // TODO: maybe remove to increase performance
    Settings.instance?.reload();

    return Settings.instance;
  }

  public reload(): void {
    this.config = workspace.getConfiguration(this.pkg.name);
  }

  public get(key: SettingsKey): Setting {
    return this.config.get(key);
  }

  public getIt<T>(key: SettingsKey): T | undefined {
    const value = this.config.get(key);
    // TODO: typeof value !== T does currently not work in TypeScript
    // but if it could be a good backend for getString, getBoolean and so on
    if (value === undefined) {
      return undefined;
    }

    return value as T;
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
    // null == workspace folder settings, false == workspace settings
    return this.config.update(key, value, null);
  }

  public updateGlobal<T>(key: SettingsKey, value: T): Thenable<void> {
    return this.config.update(key, value, true);
  }

  // helpers
  public getExtensionName(): string {
    return this.pkg.name;
  }

  public getExtensionId(): string {
    return [this.pkg.publisher, this.pkg.name].join(".");
  }
}
