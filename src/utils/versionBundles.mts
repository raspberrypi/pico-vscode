import { readFileSync } from "fs";
import { Uri } from "vscode";

export interface VersionBundle {
  ninja: string;
  cmake: string;
}

export interface VersionBundles {
  [version: string]: VersionBundle;
}

export default class VersionBundlesLoader {
  private bundles: VersionBundles;

  constructor(extensionUri: Uri) {
    try {
      const bundles = readFileSync(
        Uri.joinPath(extensionUri, "scripts", "versionBundles.json").fsPath,
        "utf8"
      );
      this.bundles = JSON.parse(bundles) as VersionBundles;
    } catch (e) {
      this.bundles = {};
    }
  }

  public getModuleVersion(version: string): VersionBundle | undefined {
    return this.bundles[version];
  }
}
