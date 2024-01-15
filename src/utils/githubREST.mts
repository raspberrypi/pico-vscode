import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import Settings, { SettingsKey } from "../settings.mjs";
import Logger from "../logger.mjs";
import GithubApiCache, {
  GithubApiCacheEntryDataType,
} from "./githubApiCache.mjs";

const HTTP_STATUS_NOT_MODIFIED = 304;

export enum GithubRepository {
  picoSDK = 0,
  cmake = 1,
  ninja = 2,
  tools = 3,
}

export type GithubReleaseResponse = {
  assetsUrl: string;
  assets: GithubReleaseAssetData[];
};

export type GithubReleaseAssetData = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  browser_download_url: string;
};

// NOTE: The primary rate limit for unauthenticated requests is 60 requests per hour.
export const SDK_REPOSITORY_URL = "https://github.com/raspberrypi/pico-sdk.git";
export const NINJA_REPOSITORY_URL = "https://github.com/ninja-build/ninja.git";
export const CMAKE_REPOSITORY_URL = "https://github.com/Kitware/CMake.git";
export const PYENV_REPOSITORY_URL = "https://github.com/pyenv/pyenv.git";

function ownerOfRepository(repository: GithubRepository): string {
  switch (repository) {
    case GithubRepository.picoSDK:
      return "raspberrypi";
    case GithubRepository.cmake:
      return "Kitware";
    case GithubRepository.ninja:
      return "ninja-build";
    case GithubRepository.tools:
      return "will-v-pi";
  }
}

function repoNameOfRepository(repository: GithubRepository): string {
  switch (repository) {
    case GithubRepository.picoSDK:
      return "pico-sdk";
    case GithubRepository.cmake:
      return "CMake";
    case GithubRepository.ninja:
      return "ninja";
    case GithubRepository.tools:
      return "pico-sdk-tools";
  }
}

export function getOctokitConfig(): { auth?: string } {
  const config: { auth?: string } = {};
  const githubPAT = Settings.getInstance()?.getString(SettingsKey.githubToken);
  if (githubPAT) {
    config.auth = githubPAT;
  }

  return config;
}

async function getReleases(repository: GithubRepository): Promise<string[]> {
  try {
    const octokit = new Octokit(getOctokitConfig());
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

    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/releases",
      {
        owner: owner,
        repo: repo,
        headers: headers,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        per_page: 20,
      }
    );

    if (response.status !== 200) {
      return [];
    }

    const responseData = response.data
      //.slice(0, 10)
      .flatMap(release => release.tag_name)
      .filter(release => release !== null);

    // store the response in the cache
    await GithubApiCache.getInstance().saveResponse(
      repository,
      GithubApiCacheEntryDataType.releases,
      responseData,
      response.headers.etag
    );

    return responseData;
  } catch (error) {
    if (
      error instanceof RequestError &&
      error.status === HTTP_STATUS_NOT_MODIFIED
    ) {
      // TODO: maybe debug message to verify that we are actually using the cached response
      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.releases
      );
      if (cachedResponse) {
        // TODO: getResponse different prototypes for different entry data types
        return cachedResponse.data as string[];
      }
    }

    return [];
  }
}

export async function getSDKReleases(): Promise<string[]> {
  return getReleases(GithubRepository.picoSDK);
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
    const octokit = new Octokit(getOctokitConfig());
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

    const releaseResponse = await octokit.rest.repos.getReleaseByTag({
      owner: owner,
      repo: repo,
      tag: tag,
      headers: headers,
    });

    // DOESN'T CURRENTLY WORK
    // check if we got a 304 Not Modified response and load the cached response
    /*if (releaseResponse.status === HTTP_STATUS_NOT_MODIFIED) {
    const cachedResponse = await GithubApiCache.getInstance().getResponse(
      repository,
      GithubApiCacheEntryDataType.tag
    );
    if (cachedResponse) {
      return cachedResponse.data as GithubReleaseResponse;
    }
    }*/

    if (releaseResponse.status !== 200 || releaseResponse.data === undefined) {
      Logger.log(`Error fetching ${repo} release ${tag}.`);

      return;
    }

    const responseData = {
      assets: releaseResponse.data.assets,
      assetsUrl: releaseResponse.data.assets_url,
    };

    // store the response in the cache
    await GithubApiCache.getInstance().saveResponse(
      repository,
      GithubApiCacheEntryDataType.tag,
      responseData,
      releaseResponse.headers.etag
    );

    return responseData;
  } catch (error) {
    // TODO: VERY UGLY WORKAROUND CAUSE OCTOKIT WON'T accept 304 Not Modified status codes
    if (
      error instanceof Error &&
      error.message === "Unexpected end of JSON input"
    ) {
      const cachedResponse = await GithubApiCache.getInstance().getResponse(
        repository,
        GithubApiCacheEntryDataType.releases
      );
      if (cachedResponse) {
        // TODO: getResponse different prototypes for different entry data types
        return cachedResponse.data as GithubReleaseResponse;
      }
    }

    return;
  }
}
