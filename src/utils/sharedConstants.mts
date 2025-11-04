export const WINDOWS_X86_PYTHON_DOWNLOAD_URL =
  "https://www.python.org/ftp/python/3.13.7/python-3.13.7-embed-amd64.zip";
export const WINDOWS_ARM64_PYTHON_DOWNLOAD_URL =
  "https://www.python.org/ftp/python/3.13.7/python-3.13.7-embed-arm64.zip";
export const CURRENT_PYTHON_VERSION = "3.13.7";
export const GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py";

export const CURRENT_DATA_VERSION = "0.18.0";
export const OPENOCD_VERSION = "0.12.0+dev";

export const WINDOWS_X86_GIT_DOWNLOAD_URL =
  "https://github.com/git-for-windows/git/releases/download" +
  "/v2.51.0.windows.2/MinGit-2.51.0.2-64-bit.zip";

export const EXAMPLES_REPOSITORY_URL =
  "https://github.com/raspberrypi/pico-examples.git";
export const EXAMPLES_JSON_URL =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/examples.json`;
export const EXAMPLES_GITREF = "4c3a3dc0196dd426fddd709616d0da984e027bab";
export const EXAMPLES_TAG = "sdk-2.2.0";

export const VERSION_BUNDLES_URL =
  "https://raspberrypi.github.io/pico-vscode/" +
  `${CURRENT_DATA_VERSION}/versionBundles.json`;

export const WINDOWS_X86_DTC_DOWNLOAD_URL =
  "https://github.com/oss-winget/oss-winget-storage/raw/" +
  "96ea1b934342f45628a488d3b50d0c37cf06012c/packages/dtc/" +
  "1.6.1/dtc-msys2-1.6.1-x86_64.zip";
export const CURRENT_DTC_VERSION = "1.6.1";
export const WINDOWS_X86_GPERF_DOWNLOAD_URL =
  "https://github.com/oss-winget/oss-winget-storage/raw/" +
  "d033d1c0fb054de32043af1d4d3be71b91c38221/packages/" +
  "gperf/3.1/gperf-3.1-win64_x64.zip";
export const CURRENT_GPERF_VERSION = "3.1";
export const LICENSE_URL_7ZIP = "https://7-zip.org/license.txt";
export const WINDOWS_X86_7ZIP_DOWNLOAD_URL = "https://www.7-zip.org/a/7zr.exe";

export const CMAKELISTS_ZEPHYR_HEADER = "#pico-zephyr-project";

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
  zephyr = 5,
}

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
    case GithubRepository.zephyr:
      return "zephyrproject-rtos";
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
    case GithubRepository.zephyr:
      return "zephyr";
  }
}

// NOTE: The primary rate limit for unauthenticated requests is 60 requests per hour.
export const SDK_REPOSITORY_URL = "https://github.com/raspberrypi/pico-sdk.git";
export const NINJA_REPOSITORY_URL = "https://github.com/ninja-build/ninja.git";
export const CMAKE_REPOSITORY_URL = "https://github.com/Kitware/CMake.git";
export const PYENV_REPOSITORY_URL = "https://github.com/pyenv/pyenv.git";
export const ZEPHYR_REPOSITORY_URL =
  "https://github.com/zephyrproject-rtos/zephyr.git";
