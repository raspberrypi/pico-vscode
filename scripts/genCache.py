import json
import os
import sys

import requests
import js2py


dir_path = os.path.dirname(os.path.realpath(__file__))
os.chdir(f"{dir_path}/..")

# Extract js for variables
with open("dist/extension.cjs", "r") as f:
    keep = False
    txt = ""
    for line in f.readlines():
        if "const EXT_USER_AGENT =" in line:
            keep = True
        elif "getAuthorizationHeaders" in line:
            keep = False
        elif "const CURRENT_DATA_VERSION =" in line:
            keep = True
        
        if keep:
            txt += line

        if "const CURRENT_DATA_VERSION =" in line:
            keep = False

parsed = js2py.translate_js(txt)
with open("tmp.py", "w") as f:
    f.write(parsed)
sys.path.append(os.getcwd())

import tmp

stuff = tmp.var.to_python()

# stuff.GithubRepository has conversions in both directions, so is twice the size
num_repos = 0
for _ in stuff.GithubRepository:
    num_repos += 0.5
num_repos = int(num_repos)
assert num_repos == 5
print("Num repos", num_repos)


# Only provide data for these versions
versions = [
    ["1.5.1", "2.0.0", "2.1.0"],
    ["v3.28.6", "v3.29.6", "v3.29.9"],
    ["v1.12.1"],
    ["v1.5.1-0", "v2.0.0-0", "v2.0.0-1", "v2.0.0-2", "v2.0.0-3", "v2.0.0-4", "v2.0.0-5", "v2.1.0-0"],
    ["2.0.0", "2.1.0"]
]

headers = {
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": stuff.EXT_USER_AGENT,
    "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"
}

ret = {}
for repo in range(num_repos):
    ret[f"githubApiCache-{repo}-0"] = versions[repo]

    for version in versions[repo]:
        owner = stuff.ownerOfRepository(repo)
        name = stuff.repoNameOfRepository(repo)
        x = requests.get(
            f"{stuff.GITHUB_API_BASE_URL}/repos/{owner}/{name}/releases/tags/{version}",
            headers=headers
        )
        data = json.loads(x.content)
        assets = []
        for asset in data["assets"]:
            assets.append({
                "id": asset["id"],
                "name": asset["name"],
                "browser_download_url": asset["browser_download_url"]
            })
        data = {
            "assets": assets,
            "assetsUrl": data["assets_url"]
        }

        ret[f"githubApiCache-{repo}-1-{version}"] = data
        

for k, v in ret.items():
    idx = int(k.split('-')[1])
    print(f"{k} is {stuff.GithubRepository[idx]}")
    if isinstance(v, list):
        print(v)
    else:
        print(v["assets"][0])

with open(f"data/{stuff.CURRENT_DATA_VERSION}/github-cache.json", "w") as f:
    json.dump(ret, f, indent=2)
