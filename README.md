# Raspberry Pi Pico Visual Studio Code extension

This is the official Visual Studio Code extension for Raspberry Pi Pico development. It provides a set of tools to help you develop for the Pico using Visual Studio Code.

## Features

- Project generator (supports options for Board-Type and Libraries; targets ninja build system)
- Automatic CMake configuration on project load
- Auto SDK detection on Windows, Linux and macOS (linux and macOS requires custom configuration with [pico-sdk-manager tool](https://github.com/paulober/pico-sdk-manager))
- Easy option to switch between pico-sdk versions together with the toolchain verison
- No configuration of environment variables required
- Auto SDK detection thought environment variables (detects PICO_SDK_PATH and compiler in PATH; support for PICO_TOOLCHAIN_PATH comming soon)
- Automatic download of a Toolchain and SDK if required by project and selected by the user (currently Windows only)
- Compile project status bar button

## Requirements

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

Calling out known issues can help limit users opening duplicate issues against your extension.
