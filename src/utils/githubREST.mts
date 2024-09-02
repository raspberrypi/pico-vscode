import Settings, { SettingsKey } from "../settings.mjs";
import Logger from "../logger.mjs";
import GithubApiCache, {
  GithubApiCacheEntryDataType,
} from "./githubApiCache.mjs";
import { type RequestOptions, request } from "https";
import { unknownToError } from "./catchHelper.mjs";

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_MODIFIED = 304;
export const EXT_USER_AGENT = "Raspberry-Pi Pico VS Code Extension";
export const GITHUB_API_BASE_URL = "https://api.github.com";

export enum GithubRepository {
  picoSDK = 0,
  cmake = 1,
  ninja = 2,
  tools = 3,
  picotool = 4,
}

export type GithubReleaseResponse = {
  assetsUrl: string;
  assets: GithubReleaseAssetData[];
};

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

export function ownerOfRepository(repository: GithubRepository): string {
  switch (repository) {
    case GithubRepository.picoSDK:
      return "raspberrypi";
    case GithubRepository.cmake:
      return "Kitware";
    case GithubRepository.ninja:
      return "ninja-build";
    case GithubRepository.tools:
      return "raspberrypi";
    case GithubRepository.picotool:
      return "raspberrypi"
  }
}

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
      return "picotool"
  }
}

interface AuthorizationHeaders {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Authorization?: string;
}

export function getAuthorizationHeaders(): AuthorizationHeaders {
  const headers: AuthorizationHeaders = {};
  // takes some time to execute (noticable in UI)
  const githubPAT = Settings.getInstance()?.getString(SettingsKey.githubToken);
  if (githubPAT && githubPAT.length > 0) {
    Logger.log("Using GitHub Personal Access Token for authentication");
    headers.Authorization = `Bearer ${githubPAT}`;
  }

  return headers;
}

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
          // TODO: replace with proper logging
          console.error("Error parsing JSON:", error);
          reject(unknownToError(error));
        }
      });
    });

    req.on("error", error => {
      console.error("Error making GET request:", error.message);
      reject(error);
    });

    req.end();
  });
}

async function getReleases(repository: GithubRepository): Promise<string[]> {
  try {
    const owner = ownerOfRepository(repository);
    const repo = repoNameOfRepository(repository);
    const lastEtag = await GithubApiCache.getInstance().getLastEtag(
      repository,
      GithubApiCacheEntryDataType.releases
    );
    const headers: { [key: string]: string } = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (lastEtag) {
      headers["if-none-match"] = lastEtag;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const response = await makeAsyncGetRequest<Array<{ tag_name: string }>>(
      `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/releases`,
      headers
    );

    if (response.status === HTTP_STATUS_NOT_MODIFIED) {
      Logger.log("Using cached response for", repo, "releases");

      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.releases
      );
      if (cachedResponse) {
        return cachedResponse.data as string[];
      }
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
  } catch {
    Logger.log("Error fetching", repoNameOfRepository(repository), "releases");

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
    const headers: { [key: string]: string } = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    };
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
      Logger.log("Using cached response for", repo, "release by tag", tag);

      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.tag,
        tag
      );
      if (cachedResponse) {
        return cachedResponse.data as GithubReleaseResponse;
      }
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
  } catch {
    Logger.log("Error fetching", repoNameOfRepository(repository), "releases");

    return (
      await GithubApiCache.getInstance().getDefaultResponse(
        repository,
        GithubApiCacheEntryDataType.tag,
        tag
      )
    )?.data as GithubReleaseResponse;
  }
}
