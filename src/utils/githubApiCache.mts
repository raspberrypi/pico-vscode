// TODO: put defaults into json file, to prevent need for these disables
import type { ExtensionContext, Memento } from "vscode";
import type { GithubReleaseResponse, GithubRepository } from "./githubREST.mjs";
import Logger, { LoggerSource } from "../logger.mjs";
import { getDataRoot } from "./downloadHelpers.mjs";
import { get } from "https";
import { isInternetConnected } from "./downloadHelpers.mjs";
import { join as joinPosix } from "path/posix";
import { readFileSync } from "fs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { CURRENT_DATA_VERSION } from "./sharedConstants.mjs";

/**
 * Tells if the stored data is a GithubReleaseResponse (data of a specific release)
 * or a string array (release tags).
 */
export enum GithubApiCacheEntryDataType {
  releases = 0,
  tag = 1,
}

/// The data structure containing the cached data of a Github API request.
export interface GithubApiCacheEntry {
  /// Identity of entry is a combination of repository and dataType.
  repository: GithubRepository;
  /// Identity of entry is a combination of repository and dataType.
  dataType: GithubApiCacheEntryDataType;

  /// The cached data.
  data: GithubReleaseResponse | string[];

  /// Use to check if the cached data is still up to date.
  etag: string;
}

const CACHE_JSON_URL =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/github-cache.json`;

function parseCacheJson(data: string): {
  [id: string]: GithubReleaseResponse | string[];
} {
  try {
    const cache = JSON.parse(data.toString()) as {
      [id: string]: GithubReleaseResponse | string[];
    };

    return cache;
  } catch (error) {
    Logger.error(
      LoggerSource.githubApiCache,
      "Failed to parse github-cache.json:",
      unknownErrorToString(error)
    );

    // TODO: no rethrowing in catch block!
    throw new Error("Parsing Failed");
  }
}

export async function defaultCacheOfRepository(
  repository: GithubRepository,
  dataType: GithubApiCacheEntryDataType,
  tag?: string
): Promise<GithubApiCacheEntry | undefined> {
  const ret: GithubApiCacheEntry = {
    repository: repository,
    dataType: dataType,
    data: [],
    etag: "",
  };
  try {
    if (!(await isInternetConnected())) {
      throw new Error(
        "Error while downloading github cache. " + "No internet connection"
      );
    }
    const result = await new Promise<{
      [id: string]: GithubReleaseResponse | string[];
    }>((resolve, reject) => {
      // Download the JSON file
      get(CACHE_JSON_URL, response => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              "Error while downloading github cache list. " +
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
          // Resolve with the array of SupportedToolchainVersion
          const ret = parseCacheJson(data);
          if (ret !== undefined) {
            resolve(ret);
          } else {
            reject(
              new Error(
                "Error while downloading github cache list. " +
                  "Parsing data failed"
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

    Logger.debug(
      LoggerSource.githubApiCache,
      "Successfully downloaded github cache from the internet."
    );

    ret.data =
      result[
        `githubApiCache-${repository}-${dataType}` +
          `${tag !== undefined ? "-" + tag : ""}`
      ];

    return ret;
  } catch (error) {
    Logger.error(
      LoggerSource.githubApiCache,
      "Failed to download github-cache.json:",
      unknownErrorToString(error)
    );

    try {
      const cacheFile = readFileSync(
        joinPosix(getDataRoot(), "github-cache.json")
      );
      const parsed = parseCacheJson(cacheFile.toString("utf-8"));
      ret.data =
        parsed[
          `githubApiCache-${repository}-${dataType}` +
            `${tag !== undefined ? "-" + tag : ""}`
        ];

      return ret;
    } catch (error) {
      Logger.error(
        LoggerSource.githubApiCache,
        "Failed to load local github-cache.json:",
        unknownErrorToString(error)
      );

      return undefined;
    }
  }
}

/**
 * A simple cache for Github API responses to avoid hittign the rate limit,
 * and to avoid putting unnecessary load on the Github servers.
 */
export default class GithubApiCache {
  private static instance?: GithubApiCache;
  private globalState: Memento;

  private constructor(context: ExtensionContext) {
    this.globalState = context.globalState;
  }

  /**
   * Creates a new instance of the GithubApiCache as singleton.
   *
   * @param context The extension context.
   * @returns A reference to the created singleton instance.
   */
  public static createInstance(context: ExtensionContext): GithubApiCache {
    GithubApiCache.instance = new GithubApiCache(context);

    return GithubApiCache.instance;
  }

  /**
   * Returns the singleton instance of the GithubApiCache if available.
   *
   * @throws An error if the singleton instance is not available. It can be created
   * by calling createInstance() with the extension context.
   * @returns The requested singleton instance or throws an error if the instance is not available.
   */
  public static getInstance(): GithubApiCache {
    if (GithubApiCache.instance === undefined) {
      throw new Error("GithubApiCache not initialized.");
    }

    return GithubApiCache.instance;
  }

  /**
   * Saves the given response in the cache together with its etag.
   *
   * @param repository The repository the response is for.
   * @param dataType The type of the request (for this repository) the response is from.
   * @param data The response data to save.
   * @param etag The etag of the response.
   * @returns A promise that resolves when the response is saved.
   */
  public async saveResponse(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType,
    data: GithubReleaseResponse | string[],
    tag?: string,
    etag?: string
  ): Promise<void> {
    if (etag === undefined) {
      Logger.warn(
        LoggerSource.githubApiCache,
        "Can't save response without etag."
      );

      return;
    }

    await this.globalState.update(
      `githubApiCache-${repository}-${dataType}` +
        `${tag !== undefined ? "-" + tag : ""}`,
      {
        repository,
        dataType,
        data,
        etag,
      } as GithubApiCacheEntry
    );
  }

  public async getResponse(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType,
    tag?: string
  ): Promise<GithubApiCacheEntry | undefined> {
    return this.globalState.get(
      `githubApiCache-${repository}-${dataType}` +
        `${tag !== undefined ? "-" + tag : ""}`
    );
  }

  /**
   * Returns the last etag of the given repository and data type.
   *
   * @param repository The repository to get the last etag for.
   * @param dataType The type of request (for this repository) to get the last etag for.
   * @returns The last etag of the given repository and data type combination or
   * undefined if no etag is stored.
   */
  public async getLastEtag(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType,
    tag?: string
  ): Promise<string | undefined> {
    const response = await this.getResponse(repository, dataType, tag);

    return response?.etag;
  }

  public async getDefaultResponse(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType,
    tag?: string
  ): Promise<GithubApiCacheEntry | undefined> {
    const lastEtag = await GithubApiCache.getInstance().getLastEtag(
      repository,
      dataType
    );
    if (lastEtag) {
      return this.globalState.get(
        `githubApiCache-${repository}-${dataType}` +
          `${tag !== undefined ? "-" + tag : ""}`
      );
    } else {
      return defaultCacheOfRepository(repository, dataType, tag);
    }
  }

  /**
   * Clears the github api cache.
   */
  public async clear(): Promise<void> {
    // for all keys in global state starting with githubApiCache- delete
    for (const key of this.globalState.keys()) {
      if (key.startsWith("githubApiCache-")) {
        await this.globalState.update(key, undefined);
      }
    }
  }
}
