# Raspberry Pi Pico Visual Studio Code extension

> NOTE: The extension is still under development.

This is the official Visual Studio Code extension for Raspberry Pi Pico development. It provides a set of tools to help you get started with development for the Pico boards using Visual Studio Code and the official [Pico SDK](https://github.com/raspberrypi/pico-sdk).

This extension is documented in the [Getting started with Raspberry Pi Pico-series](https://datasheets.raspberrypi.com/pico/getting-started-with-pico.pdf) PDF

[Download latest Beta 📀](https://github.com/raspberrypi/pico-vscode/releases)

## Features

- Project generator (targets ninja build-system)
- Automatic CMake configuration on project load
- Easy option to switch between different versions of the Pico-SDK and tools
- No configuration of environment variables required
- Automatic download/management of Toolchain and SDK and some tools (no separate manual download/installation required)
- One-click project compilation per status bar button (with the selected Pico-SDK and tools)
- Offline documentation for the Pico-SDK

## Requirements by OS

> Supported Platforms: Windows x64, macOS (Sonoma and newer only), Linux x64 and arm64

- Visual Studio Code v1.87.0 or later

### macOS
All requirements for macOS can be installed by running `xcode-select --install` from Terminal
- Git 2.28 or later (in PATH)
- Tar (in PATH)
- Native C/C++ compiler (in PATH), supported compilers are: `gcc` and `clang`

### Raspberry Pi OS
As of March 2024, all new Raspberry Pi OS images come with the requirements pre-installed.
On older images the requirements can be installed by running `sudo apt install openocd ninja-build`

### Linux
- Python 3.9 or later (in PATH or set in settings)
- Git 2.28 or later (in PATH)
- Tar (in PATH)
- Native C/C++ compiler (in PATH), supported compilers are: `gcc` and `clang`
- \[Optional\] OpenOCD for debugging (Raspberry Pi OS only)
- \[Optional\] gdb-multiarch for debugging (x86_64 only)
- \[Ubuntu 22.04\] libftdi1-2 and libhidapi-hidraw0 apt packages are required to use OpenOCD

## Extension Settings

This extension contributes the following settings:

* `raspberry-pi-pico.cmakePath`: Set custom cmake path
* `raspberry-pi-pico.python3Path`: Set custom python3 path
* `raspberry-pi-pico.ninjaPath`: Set custom ninja path
* `raspberry-pi-pico.gitPath`: Set custom git path
* `raspberry-pi-pico.cmakeAutoConfigure`: Enable/Disable cmake auto configure on project load
* `raspberry-pi-pico.githubToken`: Takes a GitHub personal access token (classic) with the `public_repo` scope. It is used to check GitHub for available versions of the Pico SDK and other tools. Without one, the extension will use the GitHub API unauthenticated, which has a much lower rate limit causing many features to not work properly if the limit is reached. The unauthenticated rate limit is per public IP address, so this is more likely to be necessary if you share your IP address with many other users.

## VS Code Profiles

For developers working with multiple microcontroller toolchains, you can install the extension into a [VS Code Profile](https://code.visualstudio.com/docs/editor/profiles) to prevent conflicts with other toolchains. To do this simply download the sample profile [here](scripts/Pico.code-profile), then press Ctrl+Shift+P and click "Profiles: Import Profile" to import that file. This will install the extension into only the Pico profile, to prevent any conflicts with other extensions.

## Known Issues

- Custom Ninja, Python3 and git paths are not stored in `CMakeLists.txt` like the SDK and Toolchain paths, so using them requires the user to build and configure the project through the extension

### GitHub API Rate Limit ("Error while retrieving SDK and toolchain versions")

If the extension fails to get available Pico SDK versions, it might be because of the GitHub API rate limit. You can create a personal access token (classic) with the `public_repo` scope and set it in the global ("User" not "Workspace") extension settings to increase the rate limit.

## Build Instructions

For advanced users who want to build the .vsix file for the extension, these instructions *might* work for you.

1. Install npm (see [here](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows) for Windows instructions)
2. Install yarn `npm install --global yarn`
3. Install vsce `npm install --global @vscode/vsce`
4. Run `yarn` from the project directory
5. Run `vsce package` from the project directory

This will produce a .vsix file which can then be installed in VS Code with `code --install-extension path-to.vsix` or in the GUI `Extensions > three dots > install vsix`.
