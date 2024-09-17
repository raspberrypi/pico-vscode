import Settings, { SettingsKey } from "../settings.mjs";
import Logger, { LoggerSource } from "../logger.mjs";
import GithubApiCache, {
  GithubApiCacheEntryDataType,
} from "./githubApiCache.mjs";
import { type RequestOptions, request } from "https";
import { unknownErrorToString, unknownToError } from "./errorHelper.mjs";
import { window } from "vscode";

// TODO: move into web consts
export const HTTP_STATUS_OK = 200;
export const HTTP_STATUS_NOT_MODIFIED = 304;
export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_FORBIDDEN = 403;
export const EXT_USER_AGENT = "Raspberry Pi Pico VS Code Extension";
export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";

/**
 * Enum containing supported repositories on GitHub.
 */
export enum GithubRepository {
  picoSDK = 0,
  cmake = 1,
  ninja = 2,
  tools = 3,
  picotool = 4,
}

/**
 * Interface for a response from the GitHub REST API
 * release endpoint.
 */
export type GithubReleaseResponse = {
  assetsUrl: string;
  assets: GithubReleaseAssetData[];
};

/**
 * Interface for data of a release asset from the GitHub REST API.
 */
export type GithubReleaseAssetData = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  browser_download_url: string;
  id: number;
};

// NOTE: The primary rate limit for unauthenticated requests is 60 requests per hour.
export const SDK_REPOSITORY_URL = "https://github.com/raspberrypi/pico-sdk.git";
export const NINJA_REPOSITORY_URL = "https://github.com/ninja-build/ninja.git";
export const CMAKE_REPOSITORY_URL = "https://github.com/Kitware/CMake.git";
export const PYENV_REPOSITORY_URL = "https://github.com/pyenv/pyenv.git";

/**
 * Get the url friendly owner of a repository on GitHub.
 *
 * @param repository The repository to get the owner of
 * @returns The owner of the repository on GitHub
 */
export function ownerOfRepository(repository: GithubRepository): string {
  switch (repository) {
    case GithubRepository.picoSDK:
    case GithubRepository.tools:
    case GithubRepository.picotool:
      return "raspberrypi";
    case GithubRepository.cmake:
      return "Kitware";
    case GithubRepository.ninja:
      return "ninja-build";
  }
}

/**
 * Convert a GithubRepository enum value to the url friendly name
 * of the repository on GitHub it represents.
 *
 * @param repository The repository to get the name of
 * @returns The name of the repository on GitHub
 */
export function repoNameOfRepository(repository: GithubRepository): string {
  switch (repository) {
    case GithubRepository.picoSDK:
      return "pico-sdk";
    case GithubRepository.cmake:
      return "CMake";
    case GithubRepository.ninja:
      return "ninja";
    case GithubRepository.tools:
      return "pico-sdk-tools";
    case GithubRepository.picotool:
      return "picotool";
  }
}

/**
 * Interface for authorization headers to include in a request.
 */
interface AuthorizationHeaders {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Authorization?: string;
}

/**
 * Get the authorization headers to include in a request to the GitHub REST API
 * if a GitHub Personal Access Token is set in the settings.
 *
 * @returns Authorization headers to include in a request
 */
export function getAuthorizationHeaders(): AuthorizationHeaders {
  const headers: AuthorizationHeaders = {};
  // takes some time to execute (noticable in UI)
  const githubPAT = Settings.getInstance()?.getString(SettingsKey.githubToken);
  if (githubPAT && githubPAT.length > 0) {
    Logger.info(
      LoggerSource.githubRestApi,
      "Using GitHub PAT for authentication with the GitHub REST API"
    );
    headers.Authorization = `Bearer ${githubPAT}`;
  }

  return headers;
}

/**
 * Make GET request to the specified path on the GitHub REST API.
 * Will take care of adding authorization headers, user agent
 * and other necessary headers.
 *
 * @param url The relative path to an endpoint in the GitHub REST API
 * to make the request to
 * @param headers Additional headers to include in the request like etag stuff
 * @returns The response from the request
 */
async function makeAsyncGetRequest<T>(
  url: string,
  headers: { [key: string]: string }
): Promise<{
  status: number;
  data: T | null;
  headers: { etag?: string };
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: RequestOptions = {
      method: "GET",
      headers: {
        ...getAuthorizationHeaders(),
        ...headers,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "User-Agent": EXT_USER_AGENT,
      },
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      minVersion: "TLSv1.2",
      protocol: urlObj.protocol,
    };

    const req = request(options, res => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString();
        try {
          const jsonData =
            res.statusCode && res.statusCode === HTTP_STATUS_OK
              ? (JSON.parse(responseBody) as T)
              : null;
          const response = {
            status: res.statusCode ?? -1,
            data: jsonData,
            headers: { etag: res.headers.etag },
          };
          resolve(response);
        } catch (error) {
          Logger.error(
            LoggerSource.githubRestApi,
            "Parsing JSON failed:",
            unknownErrorToString(error)
          );
          reject(unknownToError(error));
        }
      });
    });

    req.on("error", error => {
      Logger.error(
        LoggerSource.githubRestApi,
        "GET request failed:",
        error.message
      );
      reject(error);
    });

    req.end();
  });
}

/**
 * Get the latest release tags from the GitHub REST API.
 *
 * @param repository The repository to fetch the latest release tag from
 * @returns A list of release tags or an empty list if the tags could not be fetched
 */
async function getReleases(repository: GithubRepository): Promise<string[]> {
  try {
    const owner = ownerOfRepository(repository);
    const repo = repoNameOfRepository(repository);
    const lastEtag = await GithubApiCache.getInstance().getLastEtag(
      repository,
      GithubApiCacheEntryDataType.releases
    );
    const headers: { [key: string]: string } = {};
    if (lastEtag) {
      headers["if-none-match"] = lastEtag;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const response = await makeAsyncGetRequest<Array<{ tag_name: string }>>(
      `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/releases`,
      headers
    );

    if (response.status === HTTP_STATUS_NOT_MODIFIED) {
      Logger.debug(
        LoggerSource.githubRestApi,
        "Using cached response for",
        repo,
        "releases."
      );

      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.releases
      );
      if (cachedResponse) {
        return cachedResponse.data as string[];
      }
    } else if (response.status === HTTP_STATUS_UNAUTHORIZED) {
      await githubApiUnauthorized();

      return getReleases(repository);
    } else if (response.status === HTTP_STATUS_FORBIDDEN) {
      // return the default response as without a PAT
      // ther is no way a rerun will succeed in the near future
      throw new Error("GitHub API Code 403 Forbidden. Rate limit exceeded.");
    } else if (response.status !== 200) {
      throw new Error("Error http status code: " + response.status);
    }

    if (response.data !== null) {
      const responseData = response.data
        //.slice(0, 10)
        .flatMap(release => release.tag_name)
        .filter(release => release !== null);

      // store the response in the cache
      await GithubApiCache.getInstance().saveResponse(
        repository,
        GithubApiCacheEntryDataType.releases,
        responseData,
        undefined,
        response.headers.etag
      );

      return responseData;
    } else {
      throw new Error("response.data is null");
    }
  } catch (error) {
    Logger.error(
      LoggerSource.githubRestApi,
      "Fetching",
      repoNameOfRepository(repository),
      "releases failed:",
      unknownErrorToString(error)
    );

    return (
      await GithubApiCache.getInstance().getDefaultResponse(
        repository,
        GithubApiCacheEntryDataType.releases
      )
    )?.data as string[];
  }
}

export async function getSDKReleases(): Promise<string[]> {
  return getReleases(GithubRepository.picoSDK);
}

export async function getPicotoolReleases(): Promise<string[]> {
  return getReleases(GithubRepository.picotool);
}

export async function getNinjaReleases(): Promise<string[]> {
  return getReleases(GithubRepository.ninja);
}

export async function getCmakeReleases(): Promise<string[]> {
  return getReleases(GithubRepository.cmake);
}

/**
 * Get the release data for a specific tag from
 * the GitHub RESY API.
 *
 * @param repository The repository to fetch the release from
 * @param tag The tag of the release to fetch
 * @returns The release data or undefined if the release could not be fetched
 */
export async function getGithubReleaseByTag(
  repository: GithubRepository,
  tag: string
): Promise<GithubReleaseResponse | undefined> {
  try {
    const owner = ownerOfRepository(repository);
    const repo = repoNameOfRepository(repository);
    const lastEtag = await GithubApiCache.getInstance().getLastEtag(
      repository,
      GithubApiCacheEntryDataType.tag,
      tag
    );
    const headers: { [key: string]: string } = {};
    if (lastEtag) {
      headers["if-none-match"] = lastEtag;
    }

    const response = await makeAsyncGetRequest<{
      assets: GithubReleaseAssetData[];
      // eslint-disable-next-line @typescript-eslint/naming-convention
      assets_url: string;
    }>(
      `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/releases/tags/${tag}`,
      headers
    );

    if (response.status === HTTP_STATUS_NOT_MODIFIED) {
      Logger.debug(
        LoggerSource.githubRestApi,
        "Using cached response for",
        repo,
        "release by tag",
        tag
      );

      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.tag,
        tag
      );
      if (cachedResponse) {
        return cachedResponse.data as GithubReleaseResponse;
      }
    } else if (response.status === HTTP_STATUS_UNAUTHORIZED) {
      await githubApiUnauthorized();

      return getGithubReleaseByTag(repository, tag);
    } else if (response.status === HTTP_STATUS_FORBIDDEN) {
      // return the default response as without a PAT
      // ther is no way a rerun will succeed in the near future
      throw new Error("GitHub API Code 403 Forbidden. Rate limit exceeded.");
    } else if (response.status !== 200) {
      throw new Error("Error http status code: " + response.status);
    }

    if (response.data !== null) {
      const responseData = {
        assets: response.data.assets,
        assetsUrl: response.data.assets_url,
      };

      // store the response in the cache
      await GithubApiCache.getInstance().saveResponse(
        repository,
        GithubApiCacheEntryDataType.tag,
        responseData,
        tag,
        response.headers.etag
      );

      return responseData;
    } else {
      throw new Error("response.data is null");
    }
  } catch (error) {
    Logger.error(
      LoggerSource.githubRestApi,
      "Fetching",
      repoNameOfRepository(repository),
      "releases failed:",
      unknownErrorToString(error)
    );

    return (
      await GithubApiCache.getInstance().getDefaultResponse(
        repository,
        GithubApiCacheEntryDataType.tag,
        tag
      )
    )?.data as GithubReleaseResponse;
  }
}

// TODO: move into web consts or helper
/**
 * Show PAT might be invalid or expired warning to the user
 * and remove the PAT from the settings.
 */
export async function githubApiUnauthorized(): Promise<void> {
  Logger.warn(
    LoggerSource.githubRestApi,
    "GitHub API returned unauthorized. Removing GitHub PAT from settings."
  );
  // show a warning to the user
  void window.showWarningMessage(
    "Your GitHub Personal Access Token might be invalid or expired. " +
      "It has now been removed from the settings."
  );
  await Settings.getInstance()?.updateGlobal(SettingsKey.githubToken, "");
}
