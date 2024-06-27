import type { ExtensionContext, Memento } from "vscode";
import { type GithubReleaseResponse, GithubRepository } from "./githubREST.mjs";
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


function defaultCacheOfRepository(
  repository: GithubRepository,
  dataType: GithubApiCacheEntryDataType
): GithubApiCacheEntry {
  let ret: GithubApiCacheEntry = {
    repository: repository,
    dataType: dataType,
    data: [],
    etag: "",
  }
  switch (repository) {
    case GithubRepository.picoSDK:
      if (dataType === GithubApiCacheEntryDataType.releases) {
        ret.data = ["1.5.1"];
      }
      break;
    case GithubRepository.cmake:
      if (dataType === GithubApiCacheEntryDataType.releases) {
        ret.data = ["v3.28.0-rc6"];
      } else {
        ret.data = {
          assets: [
            {
              id: 138286891,
              name: 'cmake-3.28.0-rc6-linux-aarch64.tar.gz',
              browser_download_url: 'https://github.com/Kitware/CMake/releases/download/v3.28.0-rc6/cmake-3.28.0-rc6-linux-aarch64.tar.gz'
            },
            {
              id: 138286897,
              name: 'cmake-3.28.0-rc6-linux-x86_64.tar.gz',
              browser_download_url: 'https://github.com/Kitware/CMake/releases/download/v3.28.0-rc6/cmake-3.28.0-rc6-linux-x86_64.tar.gz'
            },
            {
              id: 138286905,
              name: 'cmake-3.28.0-rc6-macos-universal.tar.gz',
              browser_download_url: 'https://github.com/Kitware/CMake/releases/download/v3.28.0-rc6/cmake-3.28.0-rc6-macos-universal.tar.gz'
            },
            {
              id: 138286932,
              name: 'cmake-3.28.0-rc6-windows-arm64.zip',
              browser_download_url: 'https://github.com/Kitware/CMake/releases/download/v3.28.0-rc6/cmake-3.28.0-rc6-windows-arm64.zip'
            },
            {
              id: 138286937,
              name: 'cmake-3.28.0-rc6-windows-x86_64.zip',
              browser_download_url: 'https://github.com/Kitware/CMake/releases/download/v3.28.0-rc6/cmake-3.28.0-rc6-windows-x86_64.zip'
            },
          ],
          assetsUrl: 'https://api.github.com/repos/Kitware/CMake/releases/132188415/assets',
        } as GithubReleaseResponse
      }
      break;
    case GithubRepository.ninja:
      if (dataType === GithubApiCacheEntryDataType.releases) {
        ret.data = ["v1.12.1"];
      } else {
        ret.data = {
          assets: [
            {
              id: 167333823,
              name: 'ninja-linux-aarch64.zip',
              browser_download_url: 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux-aarch64.zip'
            },
            {
              id: 167333509,
              name: 'ninja-linux.zip',
              browser_download_url: 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux.zip'
            },
            {
              id: 167333196,
              name: 'ninja-mac.zip',
              browser_download_url: 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-mac.zip'
            },
            {
              id: 167333379,
              name: 'ninja-win.zip',
              browser_download_url: 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip'
            },
            {
              id: 167333478,
              name: 'ninja-winarm64.zip',
              browser_download_url: 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-winarm64.zip'
            }
          ],
          assetsUrl: 'https://api.github.com/repos/ninja-build/ninja/releases/155357494/assets'
        } as GithubReleaseResponse
      }
      break;
    case GithubRepository.tools:
      if (dataType === GithubApiCacheEntryDataType.releases) {
        ret.data = [];
      } else {
        ret.data = {
          assets: [
            {
              id: 141973997,
              name: 'openocd-0.12.0-x64-win.zip',
              browser_download_url: 'https://github.com/will-v-pi/pico-sdk-tools/releases/download/v1.5.1-alpha-1/openocd-0.12.0-x64-win.zip'
            },
            {
              id: 141974002,
              name: 'pico-sdk-tools-1.5.1-x64-win.zip',
              browser_download_url: 'https://github.com/will-v-pi/pico-sdk-tools/releases/download/v1.5.1-alpha-1/pico-sdk-tools-1.5.1-x64-win.zip'
            },
            {
              id: 141974003,
              name: 'picotool-1.1.2-x64-win.zip',
              browser_download_url: 'https://github.com/will-v-pi/pico-sdk-tools/releases/download/v1.5.1-alpha-1/picotool-1.1.2-x64-win.zip'
            }
          ],
          assetsUrl: 'https://api.github.com/repos/will-v-pi/pico-sdk-tools/releases/134896110/assets'
        } as GithubReleaseResponse
      }
      break;
    case GithubRepository.openocd:
      if (dataType === GithubApiCacheEntryDataType.releases) {
        ret.data = [];
      } else {
        ret.data = {
          assets: [
            {
              id: 124558743,
              name: 'xpack-openocd-0.12.0-2-darwin-arm64.tar.gz',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-darwin-arm64.tar.gz'
            },
            {
              id: 124558736,
              name: 'xpack-openocd-0.12.0-2-darwin-x64.tar.gz',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-darwin-x64.tar.gz'
            },
            {
              id: 124558733,
              name: 'xpack-openocd-0.12.0-2-linux-arm.tar.gz',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-linux-arm.tar.gz'
            },
            {
              id: 124558729,
              name: 'xpack-openocd-0.12.0-2-linux-arm64.tar.gz',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-linux-arm64.tar.gz'
            },
            {
              id: 124558723,
              name: 'xpack-openocd-0.12.0-2-linux-x64.tar.gz',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-linux-x64.tar.gz'
            },
            {
              id: 124558714,
              name: 'xpack-openocd-0.12.0-2-win32-x64.zip',
              browser_download_url: 'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-win32-x64.zip'
            }
          ],
          assetsUrl: 'https://api.github.com/repos/xpack-dev-tools/openocd-xpack/releases/119866462/assets'
        } as GithubReleaseResponse
      }
      break;
  }

  return ret;
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

  public async getDefaultResponse(
    repository: GithubRepository,
    dataType: GithubApiCacheEntryDataType
  ): Promise<GithubApiCacheEntry | undefined> {
    const lastEtag = await GithubApiCache.getInstance().getLastEtag(
      repository,
      dataType
    );
    if (lastEtag) {
      return this.globalState.get(`githubApiCache-${repository}-${dataType}`);
    } else {
      return defaultCacheOfRepository(repository, dataType);
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
