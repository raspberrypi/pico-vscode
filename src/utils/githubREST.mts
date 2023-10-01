import { Octokit, App } from "octokit";

interface SDKRelease {
  tagName: string;
  downloadUrl: string;
}

export async function getSDKReleases(): Promise<SDKRelease[]> {
  const octokit = new Octokit();

  const response = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "raspberrypi",
    repo: "pico-sdk",
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  return response.data
    .flatMap(release => {
      return {
        tagName: release.tag_name,
        downloadUrl: release.zipball_url,
        // browser download: https://github.com/octocat/Hello-World/archive/refs/tags/v1.0.0.zip
        // "zipball_url": "https://api.github.com/repos/octocat/Hello-World/zipball/v1.0.0",
      };
    })
    .filter(release => release.downloadUrl !== null) as SDKRelease[];
}
