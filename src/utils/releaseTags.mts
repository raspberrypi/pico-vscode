import { readFileSync } from "fs";
import { Uri } from "vscode";
import { isInternetConnected } from "./downloadHelpers.mjs";
import { get } from "https";
import Logger from "../logger.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

const releaseTagsUrl =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/releaseTags.json`;

export interface ReleaseTags {
  tools: { [key: string]: string };
  picotool: { [key: string]: string };
  openocd: { [key: string]: string };
}

export default class ReleaseTagsLoader {
  private static instance: ReleaseTagsLoader | undefined;
  private tags?: ReleaseTags;

  private constructor(private readonly _extensionUri: Uri) {}

  public static createInstance(extensionUri: Uri): ReleaseTagsLoader {
    if (!ReleaseTagsLoader.instance) {
      ReleaseTagsLoader.instance = new ReleaseTagsLoader(extensionUri);
    }

    return ReleaseTagsLoader.instance;
  }

  public static getInstance(): ReleaseTagsLoader {
    if (!ReleaseTagsLoader.instance) {
      throw new Error("ReleaseTagsLoader not initialized");
    }

    return ReleaseTagsLoader.instance;
  }

  private async loadTags(): Promise<void> {
    try {
      if (!(await isInternetConnected())) {
        throw new Error("No internet connection");
      }

      const result = await new Promise<ReleaseTags>((resolve, reject) => {
        get(releaseTagsUrl, response => {
          if (response.statusCode !== 200) {
            reject(
              new Error(
                "Error while downloading release tags. " +
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
              // Resolve with the array of ReleaseTags
              resolve(JSON.parse(data) as ReleaseTags);
            } catch (error) {
              reject(
                new Error(
                  `Failed to parse release tags JSON: ${
                    error instanceof Error ? error.message : (error as string)
                  }`
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

      this.tags = result;
    } catch (error) {
      Logger.log(
        "Failed to download release tags:",
        error instanceof Error ? error.message : (error as string)
      );

      try {
        const tags = readFileSync(
          Uri.joinPath(
            this._extensionUri,
            "data",
            CURRENT_DATA_VERSION,
            "releaseTags.json"
          ).fsPath,
          "utf8"
        );
        this.tags = JSON.parse(tags) as ReleaseTags;
      } catch (e) {
        Logger.log(
          "Failed to load release tags from local file:",
          e instanceof Error ? e.message : (e as string)
        );
        this.tags = {
          tools: {},
          picotool: {},
          openocd: {}
        };
      }
    }
  }

  public async getReleaseTag(
    component: keyof ReleaseTags,
    version: string
  ): Promise<string | undefined> {
    if (this.tags === undefined) {
      await this.loadTags();
    }

    return this.tags?.[component]?.[version];
  }
} 
