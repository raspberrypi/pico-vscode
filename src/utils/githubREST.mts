import { get } from "http";
import { Octokit } from "octokit";

interface GithubRelease {
  tagName: string;
  //downloadUrl: string;
}

// NOTE: The primary rate limit for unauthenticated requests is 60 requests per hour.
export const SDK_REPOSITORY_URL = "https://github.com/raspberrypi/pico-sdk.git";
export const NINJA_REPOSITORY_URL = "https://github.com/ninja-build/ninja.git";
export const CMAKE_REPOSITORY_URL = "https://github.com/Kitware/CMake.git";
export const PYENV_REPOSITORY_URL = "https://github.com/pyenv/pyenv.git";

export async function getSDKReleases(): Promise<GithubRelease[]> {
  const octokit = new Octokit();

  const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "raspberrypi",
    repo: "pico-sdk",
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status !== 200) {
    return new Promise<Array<{ tagName: string }>>(resolve => {
      get("http://localhost:8080/releases/pico-sdk", response => {
        let data = "";

        // Append data as it arrives
        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          const releases: Array<{ tag_name: string }> = JSON.parse(
            data
            // eslint-disable-next-line @typescript-eslint/naming-convention
          ) as Array<{ tag_name: string }>;

          resolve(
            releases
              .flatMap(release => ({
                tagName: release.tag_name,
              }))
              .filter(release => release !== null) as Array<{ tagName: string }>
          );
        });
      });
    });
  }

  return response.data
    .flatMap(release => ({
      tagName: release.tag_name,
    }))
    .filter(release => release !== null) as GithubRelease[];
}

export async function getNinjaReleases(): Promise<Array<{ tagName: string }>> {
  const octokit = new Octokit();

  const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "ninja-build",
    repo: "ninja",
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status !== 200) {
    return new Promise<Array<{ tagName: string }>>(resolve => {
      get("http://localhost:8080/releases/Ninja", response => {
        let data = "";

        // Append data as it arrives
        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          const releases: Array<{ tag_name: string }> = JSON.parse(
            data
            // eslint-disable-next-line @typescript-eslint/naming-convention
          ) as Array<{ tag_name: string }>;

          resolve(
            releases
              .flatMap(release => ({
                tagName: release.tag_name,
              }))
              .filter(release => release !== null) as Array<{ tagName: string }>
          );
        });
      });
    });
  }

  return (
    response.data
      //.slice(0, 10)
      .flatMap(release => ({
        tagName: release.tag_name,
      }))
      .filter(release => release !== null) as Array<{ tagName: string }>
  );
}

export async function getCmakeReleases(): Promise<Array<{ tagName: string }>> {
  const octokit = new Octokit();

  const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "Kitware",
    repo: "CMake",
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status !== 200) {
    return new Promise<Array<{ tagName: string }>>(resolve => {
      get("http://localhost:8080/releases/CMake", response => {
        let data = "";

        // Append data as it arrives
        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          const releases: Array<{ tag_name: string }> = JSON.parse(
            data
            // eslint-disable-next-line @typescript-eslint/naming-convention
          ) as Array<{ tag_name: string }>;

          resolve(
            releases
              .flatMap(release => ({
                tagName: release.tag_name,
              }))
              .filter(release => release !== null) as Array<{ tagName: string }>
          );
        });
      });
    });
  }

  return (
    response.data
      //.slice(0, 10)
      .flatMap(release => ({
        tagName: release.tag_name,
      }))
      .filter(release => release !== null) as Array<{ tagName: string }>
  );
}
