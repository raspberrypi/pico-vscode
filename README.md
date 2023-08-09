# Raspberry Pi Pico Visual Studio Code extension

This is the official Visual Studio Code extension for Raspberry Pi Pico development. It provides a set of tools to help you develop for the Pico using Visual Studio Code.

[Download latest Beta RC 📀](https://github.com/paulober/vscode-raspberry-pi-pico/releases/tag/v0.5.0)

## Features

- Project generator (supports options for Board-Type and Libraries; targets ninja build system)
- Automatic CMake configuration on project load
- Auto SDK detection on Windows, Linux and macOS (linux and macOS require one-time custom configuration with [pico-sdk-manager tool](https://github.com/paulober/pico-sdk-manager))
- Easy option to switch between pico-sdk versions together with the toolchain verison
- No configuration of environment variables required
- Automatic download of a Toolchain and SDK if required by project and selected by the user (currently Windows only)
- On-click project compilation per status bar button (with the selected Pico SDK and Toolchain)

## Requirements

- Visual Studio Code v1.80.0 or later
- Python 3.9 or later (in PATH or set in settings)
- cmake (in PATH or set in settings)
- ninja (in PATH or set in settings)
- Pico SDK with arm-none-eabi-gcc toolchain (installed by Windows installer [Windows] or pico-sdk-manager [Linux, macOS], or set in settings)
- \[Optional\] OpenOCD for debuging

## Extension Settings

This extension contributes the following settings:

* `raspberry-pi-pico.picoSDK`: Set pico-sdk version (installed by Windows installer [Windows] or pico-sdk-manager [Linux, macOS])
* `raspberry-pi-pico.picoSDKPath`: Set custom pico-sdk path
* `raspberry-pi-pico.toolchainPath`: Set custom arm-none-eabi-gcc toolchain path
* `raspberry-pi-pico.cmakePath`: Set custom cmake path
* `raspberry-pi-pico.python3Path`: Set custom python3 path
* `raspberry-pi-pico.ninjaPath`: Set custom ninja path
* `raspberry-pi-pico.cmakeAutoConfigure`: Enable/Disable cmake auto configure on project load

## Known Issues

- After a new project is created, intellisense and auto-completion may not work until you completly restart VSCode (on macOS this means `right-click on VSCode icon > quit` and not just closing the window).
