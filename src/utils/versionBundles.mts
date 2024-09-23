import { readFileSync } from "fs";
import { Uri } from "vscode";
import { isInternetConnected } from "./downloadHelpers.mjs";
import { get } from "https";
import Logger from "../logger.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

const versionBundlesUrl =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/versionBundles.json`;

export interface VersionBundle {
  python: {
    version: string;
    macos: string;
    windowsAmd64: string;
  };
  ninja: string;
  cmake: string;
  picotool: string;
  toolchain: string;
  riscvToolchain: string;
}

export interface VersionBundles {
  [version: string]: VersionBundle;
}

export default class VersionBundlesLoader {
  private bundles?: VersionBundles;

  constructor(private readonly _extensionUri: Uri) {}

  // TODO: may add singleton pattern
  private async loadBundles(): Promise<void> {
    try {
      if (!(await isInternetConnected())) {
        throw new Error("No internet connection");
      }

      const result = await new Promise<VersionBundles>((resolve, reject) => {
        get(versionBundlesUrl, response => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                "Error while downloading version bundles. " +
                  `Status code: ${response.statusCode}`
              )
            );
          }
          let data = "";

          // Append data as it arrives
          response.on("data", chunk => {
            data += chunk;
          });

          // Parse the INI data when the download is complete
          response.on("end", () => {
            // Resolve with the array of SupportedToolchainVersion
            resolve(JSON.parse(data) as VersionBundles);
          });

          // Handle errors
          response.on("error", error => {
            reject(error);
          });
        });
      });

      this.bundles = result;
    } catch (error) {
      Logger.log(
        "Failed to download version bundles:",
        error instanceof Error ? error.message : (error as string)
      );

      try {
        const bundles = readFileSync(
          Uri.joinPath(
            this._extensionUri,
            "data",
            CURRENT_DATA_VERSION,
            "versionBundles.json"
          ).fsPath,
          "utf8"
        );
        this.bundles = JSON.parse(bundles) as VersionBundles;
      } catch (e) {
        Logger.log(
          "Faild to load version bundles from local file:",
          e instanceof Error ? e.message : (e as string)
        );
        this.bundles = {};
      }
    }
  }

  public async getModuleVersion(
    version: string
  ): Promise<VersionBundle | undefined> {
    if (this.bundles === undefined) {
      await this.loadBundles();
    }

    return (this.bundles ?? {})[version];
  }

  public async getPythonWindowsAmd64Url(
    pythonVersion: string
  ): Promise<VersionBundle | undefined> {
    if (this.bundles === undefined) {
      await this.loadBundles();
    }
    if (this.bundles === undefined) {
      return undefined;
    }

    const bundle = Object.values(this.bundles).find(
      bundle => bundle.python.version === pythonVersion
    );

    //return bundle?.python.windowsAmd64;
    return bundle;
  }
}
