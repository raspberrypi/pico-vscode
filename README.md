# Raspberry Pi Pico Visual Studio Code extension

This is the official Visual Studio Code extension for Raspberry Pi Pico development. It provides a set of tools to help you develop for the Pico using Visual Studio Code.

[Download latest Beta RC 📀](https://github.com/paulober/vscode-raspberry-pi-pico/releases/tag/v0.7.1)

## Features

- Project generator (supports options for Board-Type and Libraries; targets ninja build system)
- Automatic CMake configuration on project load
- Easy option to switch between Pico-SDK and ARM Toolchain versions
- No configuration of environment variables required
- Automatic download/management of Toolchain and SDK (no separate manuall download/installation required)
- On-click project compilation per status bar button (with the selected Pico-SDK and Toolchain)

## Requirements

> Supported Platforms: Windows x64, macOS x64 and arm64, Linux x64 and arm64

- Visual Studio Code v1.83.2 or later
- Python 3.9 or later (in PATH or set in settings)
- Git (in PATH)
- Tar (on Linux, in PATH)
- cmake (in PATH or set in settings)
- ninja (in PATH or set in settings)
- \[Optional\] OpenOCD for debuging

## Extension Settings

This extension contributes the following settings:

* `raspberry-pi-pico.cmakePath`: Set custom cmake path
* `raspberry-pi-pico.python3Path`: Set custom python3 path
* `raspberry-pi-pico.ninjaPath`: Set custom ninja path
* `raspberry-pi-pico.cmakeAutoConfigure`: Enable/Disable cmake auto configure on project load

## Known Issues

- After a new project is created, intellisense and auto-completion may not work until you completly restart VSCode (on macOS this means `right-click on VSCode icon > quit` and not just closing the window).
