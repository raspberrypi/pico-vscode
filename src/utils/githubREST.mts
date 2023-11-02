import { Octokit } from "octokit";

interface SDKRelease {
  tagName: string;
  //downloadUrl: string;
}

export const SDK_REPOSITORY_URL = "https://github.com/raspberrypi/pico-sdk.git";

export async function getSDKReleases(): Promise<SDKRelease[]> {
  const octokit = new Octokit();

  const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "raspberrypi",
    repo: "pico-sdk",
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  return response.data
    .flatMap(release => ({
      tagName: release.tag_name,
    }))
    .filter(release => release !== null) as SDKRelease[];
}
