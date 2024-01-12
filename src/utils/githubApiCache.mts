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

  public static createInstance(context: ExtensionContext): GithubApiCache {
    GithubApiCache.instance = new GithubApiCache(context);

    return GithubApiCache.instance;
  }

  public static getInstance(): GithubApiCache {
    if (GithubApiCache.instance === undefined) {
      throw new Error("GithubApiCache not initialized.");
    }

    return GithubApiCache.instance;
  }

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

  public async getLastEtag(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType
  ): Promise<string | undefined> {
    /*await this.globalState.update(
      `githubApiCache-${repository}-${dataType}`,
      undefined
    );*/
    const response = await this.getResponse(repository, dataType);

    return response?.etag;
  }
}
