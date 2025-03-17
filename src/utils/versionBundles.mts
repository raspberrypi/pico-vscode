import { readFileSync } from "fs";
import { Uri } from "vscode";
import { isInternetConnected } from "./downloadHelpers.mjs";
import { get } from "https";
import Logger from "../logger.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";

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
  private static instance: VersionBundlesLoader | undefined;
  private bundles?: VersionBundles;

  private constructor(private readonly _extensionUri: Uri) {}

  public static createInstance(extensionUri: Uri): VersionBundlesLoader {
    if (!VersionBundlesLoader.instance) {
      VersionBundlesLoader.instance = new VersionBundlesLoader(extensionUri);
    }

    return VersionBundlesLoader.instance;
  }

  public static getInstance(): VersionBundlesLoader {
    if (!VersionBundlesLoader.instance) {
      throw new Error("VersionBundlesLoader not initialized");
    }

    return VersionBundlesLoader.instance;
  }

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

          // Parse the JSON data when the download is complete
          response.on("end", () => {
            try {
              // Resolve with the array of VersionBundles
              resolve(JSON.parse(data) as VersionBundles);
            } catch (error) {
              reject(
                new Error(
                  `Failed to parse version bundles JSON: ${unknownErrorToString(
                    error
                  )}`
                )
              );
            }
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
        unknownErrorToString(error)
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
          "Failed to load version bundles from local file:",
          unknownErrorToString(e)
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
}
