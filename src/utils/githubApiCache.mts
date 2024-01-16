import type { ExtensionContext, Memento } from "vscode";
import type { GithubReleaseResponse, GithubRepository } from "./githubREST.mjs";
import Logger from "../logger.mjs";

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
    etag?: string
  ): Promise<void> {
    if (etag === undefined) {
      // TODO: Logger.warn
      Logger.log("GithubApiCache.saveResponse: response without etag.");

      return;
    }

    await this.globalState.update(`githubApiCache-${repository}-${dataType}`, {
      repository,
      dataType,
      data,
      etag,
    } as GithubApiCacheEntry);
  }

  public async getResponse(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType
  ): Promise<GithubApiCacheEntry | undefined> {
    return this.globalState.get(`githubApiCache-${repository}-${dataType}`);
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
    dataType: GithubApiCacheEntryDataType
  ): Promise<string | undefined> {
    const response = await this.getResponse(repository, dataType);

    return response?.etag;
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
