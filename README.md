# Raspberry Pi Pico Visual Studio Code extension

> **Note: The extension is currently under development.**

This is the official Visual Studio Code extension for Raspberry Pi Pico development. This extension equips you with a suite of tools designed to streamline your Pico projects using Visual Studio Code and the official [Pico SDK](https://github.com/raspberrypi/pico-sdk).

For comprehensive setup instructions, refer to the [Getting Started guide](https://datasheets.raspberrypi.com/pico/getting-started-with-pico.pdf) PDF.

[Download latest Beta 📀](https://github.com/raspberrypi/pico-vscode/releases)

## Features

### Project Setup and Management

- **Project Generator**: Easily create and configure new projects with support for advanced Pico features like I2C and PIO. The generator targets the Ninja build system and allows customization during project creation.
- **Swift Language Support**: Develop Pico projects using the Swift programming language by leveraging the latest **experimental** Swift toolchain. Generate Swift-enabled projects directly from the extension.
- **Quick Project Setup**: Initiate new Pico projects directly from the Explorer view, when no workspace is open.
- **MicroPython Support**: Create and develop MicroPython-based Pico projects with support provided through the [MicroPico](https://github.com/paulober/MicroPico) extension.

### Configuration and Tool Management

- **Automatic CMake Configuration**: Automatically configures CMake when loading a project.
- **Version Switching**: Seamlessly switch between different versions of the Pico SDK and tools.
- **No Manual Setup Required**: Automatically handles environment variables, toolchain, SDK, and tool management.
- **Includes an Uninstaller**: Easily remove the extension along with all automatically installed tools and SDKs.

### Build, Debug, and Documentation

- **One-Click Compilation and Debugging**: Automatically configure OpenOCD, Ninja, and CMake, allowing you to compile and debug with a single click.
- **Offline Documentation**: Conveniently access Pico SDK documentation directly within the editor, even when offline.

- **Version Switching**: Seamlessly switch between different versions of the Pico SDK and tools.
- **No Manual Setup Required**: The extension handles environment variables, toolchain, SDK, and tool management for you.
- **One-Click Compilation**: Compile projects directly from the status bar with your selected SDK and tools.
- **Offline Documentation**: Access Pico SDK documentation offline.
- **Quick Project Setup**: Quickly create new Pico projects from the Explorer view when no workspace is open.
- **MicroPython Support**: Create MicroPython-based Pico projects with support provided through the MicroPico extension.

## Requirements by OS

> **Supported Platforms: Raspberry Pi OS (64-bit), Windows 10/11 (x86_64), macOS Sonoma (14.0) and newer, Linux x64 and arm64**

- Visual Studio Code v1.92.1 or later

### Raspberry Pi OS and Windows

No additional requirements are needed.

### macOS
To meet the requirements for macOS, run the following command in Terminal to install necessary tools:
```zsh
xcode-select --install
```
This command installs all of the necessary tools, including but not limited to:
- **Git 2.28 or later** (ensure it's in your PATH)
- **Tar** (ensure it's in your PATH)

### Linux
- **Python 3.9 or later** (ensure it’s in your PATH or set in settings)
- **Git 2.28 or later** (ensure it’s in your PATH)
- **Tar** (ensure it’s in your PATH)
- **\[Optional\]** gdb-multiarch for debugging (x86_64 only)
- **\[Optional\]** udev rules installed to use [OpenOCD](https://github.com/raspberrypi/openocd/blob/sdk-2.0.0/contrib/60-openocd.rules) and [picotool](https://github.com/raspberrypi/picotool/blob/master/udev/99-picotool.rules) without `sudo`, for debugging and loading
- For **\[Ubuntu 22.04\]**, install `libftdi1-2` and `libhidapi-hidraw0` packages to use OpenOCD

## Extension Settings

This extension provides the following settings:

* `raspberry-pi-pico.cmakePath`: Specify a custom path for CMake.
* `raspberry-pi-pico.python3Path`: Specify a custom path for Python 3 _(machine scoped)_.
* `raspberry-pi-pico.ninjaPath`: Specify a custom path for Ninja.
* `raspberry-pi-pico.gitPath`: Specify a custom path for Git.
* `raspberry-pi-pico.cmakeAutoConfigure`: Enable/Disable automatic CMake configuration when project is opened
* `raspberry-pi-pico.useCmakeTools`: Enable/Disable the CMake Tools Extension Integration (see below)
* `raspberry-pi-pico.githubToken`: Provide a GitHub personal access token (classic) with the `public_repo` scope. This token is used to check for available versions of the Pico SDK and other tools. Without it, the extension uses the unauthenticated GitHub API, which has a lower rate limit and may lead to restricted functionality if the limit is exceeded. The unauthenticated rate limit is per public IP address, so a token is more necessary if your IP is shared with many users.

## CMake Tools Extension Integration

For more complex projects, such as those with multiple executables or when the project name is defined as a variable, this extension can integrate with the CMake Tools extension to enhance CMake parsing. You can enable the CMake Tools Extension integration during project generation, using the checkbox at the bottom of the page. To enable it for an existing project, just re-import the project with the option selected. Alternatively, to manually enable it, adjust the following settings in your `settings.json`:

- `raspberry-pi-pico.cmakeAutoConfigure`: Set from `true` to `false`.
- `raspberry-pi-pico.useCmakeTools`: Set from `false` to `true`.

For optimal functionality, consider enabling:

- `cmake.configureOnEdit`: true
- `cmake.automaticReconfigure`: true
- `cmake.configureOnOpen`: true

When prompted, select the `Pico` kit in CMake Tools, and set your build and launch targets accordingly. Use CMake Tools for compilation, but continue using this extension for debugging, as CMake Tools debugging is not compatible with Pico.

## Swift Support

The Pico VS Code extension supports Swift, enabling you to develop Raspberry Pi Pico projects using the Swift programming language. To enable Swift support, follow these steps:

### 1. Install the Swift Experimental Toolchain

Download and install the latest Swift experimental toolchain for your platform:

- **Linux**: [Install Swift for Linux](https://www.swift.org/install/linux/#platforms)
- **macOS**: [Install Swift for macOS](https://www.swift.org/install/macos)

> **Note:** Windows is not currently supported.

### 2. Configure the Swift Toolchain

#### **For Linux:**
Ensure the `swiftc` executable is included in your system's `PATH`. Once added, restart VS Code for the changes to take effect.

#### **For macOS:**
If the build fails or the Swift toolchain isn’t detected, force the toolchain selection by adding the following line to your `~/.zprofile`:

- **For system-wide installation:**
  ```zsh
  export TOOLCHAINS=$(plutil -extract CFBundleIdentifier raw /Library/Developer/Toolchains/swift-latest.xctoolchain/Info.plist)
  ```

- **For user-specific installation:**
  ```zsh
  export TOOLCHAINS=$(plutil -extract CFBundleIdentifier raw $HOME/Library/Developer/Toolchains/swift-latest.xctoolchain/Info.plist)
  ```

Then, restart your terminal and reopen VS Code.

### 3. Create a New Pico Project with Swift

1. Open VS Code.
2. Use the **"Generate Swift Code"** option to create a new Pico project with Swift support enabled.
> Note: At the moment, Swift support is only available for new projects based on Pico 2 and Pico SDK v2.1.0.
3. Start building your Swift-powered Pico project!

## VS Code Profiles

If you work with multiple microcontroller toolchains, consider installing this extension into a [VS Code Profile](https://code.visualstudio.com/docs/editor/profiles) to avoid conflicts with other toolchains. Follow these steps:

1. Download the sample profile from [here](scripts/Pico.code-profile).
2. Open Command Palette with `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and select `Profiles: Import Profile`.
3. Import the downloaded file to install the extension in a dedicated Pico profile.
4. This setup helps isolate the Pico extension from other extensions, reducing the risk of conflicts.

## Known Issues

- Custom Paths: Custom paths for Ninja, Python3, and Git are not stored in `CMakeLists.txt` like SDK and Toolchain paths. You need to build and configure projects through the extension to use these custom paths.

### GitHub API Rate Limit ("Error while retrieving SDK and toolchain versions")

If you encounter issues retrieving available Pico SDK versions, it may be due to GitHub API rate limits. To resolve this, create a personal access token (classic PAT) with the `public_repo` scope and set it in the global (User) extension settings to increase your rate limit.

## Build Instructions

For advanced users who want to build the extension `.vsix` file, follow these steps:

1. Install nodejs ([Instructions Windows](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows))
2. Install Yarn globally: `npm install -g yarn`
3. Install VSCE globally: `npm install -g @vscode/vsce`
4. Run `yarn` in the project directory to install dependencies.
5. Build the extension with: `vsce package`.

This will generate a `.vsix` file, which you can install in VS Code using `code --install-extension path-to.vsix` or via the GUI: `Extensions > three dots > Install from VSIX`.
