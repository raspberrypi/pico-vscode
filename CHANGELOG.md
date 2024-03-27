# Change Log

All notable changes to the "raspberry-pi-pico" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Release 1

## [0.12.2] - 2024-03-27

### Added

- Workflow for packaging and publishing extension (@will-v-pi)

### Changed

- Fix webview crash on dropdown button click (@paulober)

## [0.12.1] - 2024-03-26

### Changed

- Fixed support for Raspberry Pi SWD debugging
- Migrated to new github repository
- Fix some minor issues in the README (@nathan-contino)

## [0.12.0] - 2024-03-18

### Added

- An extension logo (@will-v-pi)
- dev_hid_composite and dev_lowlevel examples (@will-v-pi)
- Outdated GH PAT warning
- New examples input functionality based on a new custom suggestions UI
- Extension activation by "new project" panel

### Changed

- Fixed pico_w examples (@will-v-pi)
- Updated requirements in README.md (@will-v-pi)
- Update rate limit details and description in README.md
- Removed a previously known issue from README.md
- Updated yarn to v4.1.1
- Updated dependencies

## [0.11.7] - 2024-02-29

### Changed

- Switch to SDK documentation (@will-v-pi)
- Upgraded min vscode version to `v1.87.0`
- Updated dependencies

## [0.11.6] - 2024-02-06

### Added

- Icons (@will-v-pi)
- More examples (@will-v-pi)

### Changed

- Updated dependencies

## [0.11.5] - 2024-02-05

### Added

- A updated CHANGELOG.md

### Changed

- Fix #39, Raspberry Pi OS detection
- Fix #40, Light Mode Theming

## [0.11.4] - 2024-01-30

### Changed
- Added xPack openocd support for macOS and linux (excluding Raspberry Pis)
- Fix WebView crashing issue with not empty project name and pressing examples button
- Dependencies update

## [0.11.3] - 2024-01-29

### Changed
- Navigation bar in WebView now switches to a burger menu on smaller window sizes

## [0.11.2] - 2024-01-27

### Changed
- Switched to xPack openocd distribution for x64 Windows (@will-v-pi)
- Fixed WebView navigation between different project creation strategies

## [0.11.1] - 2024-01-26

### Added
- `newExampleProject` command

### Changed
- Opening a new project ui while it already open but of a different type, it now gets replaced by the new type (Import project > new project, new project > import project). And "New Example Project" toggles the "from example" or replaces the view if "import project" ui is open.
- VS Code min version is now `1.85.2`

## [0.11.0] - 2024-01-22

### Added

- Fix #33, Github API caching to reduce API load
- `githubToken` setting for a GitHub PAT to use with GitHub API calls for an extended request limit
- More example code (@will-v-pi)
- Activity bar menu
- Documentation (with search function) and `debugLayout` commands (with integration in the quick access menu)
- `configureCmake` command (with integration in the quick access menu)
- CMake project conversion (@will-v-pi)
- `examples.json` for a list of downloadable examples (@will-v-pi)
- Import project and create from example features
- Import notification if a not imported Pico project was opened
- Fix #38, Auto-generated header force included
- Fix #14, CMake, Ninja and Python auto-install if project uses managed version which are not installed

### Changed

- Fix #24, Project name validation
- Fix CMake environment problems (@will-v-pi)
- Improved C/C++ VS Code extension configuration generation (@will-v-pi)
- Fix #31, Include toolchain version in versionBundles
- Fix #26, `switchSdk` command outdated
- Fix #18, RPi First project problem [workaround]
- Propagate pico_w selection  (@will-v-pi)
- Fix #17, Circular dependency
- Host config files on GitHub Pages (@will-v-pi)
- Fix typos
- Fix GitHub language detection
- Fix pyenv install halt infinitely if python version already downloaded
- Dependencies update

### Removed

- Utilities for legacy beta versions
- Tkinter from project generator (@will-v-pi)

## [0.10.0] - 2024-01-10

### Added
- `elf2uf2` and pious for SDK 1.5.1 (@will-v-pi)
- Basic OpenOCD installation on Windows (@will-v-pi)
- Integrated terminal env settings (only on project generation, PATH not overwritten see #27) (Fixes #21)

### Changed
- Fix python error on linux
- Fix WebView not closing on error
- Fix WebView error on linux
- Fix #13, python3Path setting (@will-v-pi and @paulober)
- Install OpenOCD and tools from GitHub (@will-v-pi)
- Fix #23, Hide CMake icons (@will-v-pi)
- Clean up some code
- Fix #24, Project name validation
- Fix scroll behind navbar
- Fix #22, Location/save icon
- Use dynamic var in CMake exe setting
- Fix #19, Check for existing project
- Fix #25, Advanced options
- Fix #28, Support for Pico-SDKs prior to v1.5.0
- Updated dependencies

## [0.9.3] - 2023-12-20

### Changed
- Fix #11, CMD shell backend compatibility
- Fix #12, Git and Python installation failure
- Fix #13, `python3Path` setting

## [0.9.2] - 2023-12-19

### Changed
- Improved project generation error handling

## [0.9.1] - 2023-12-19

### Changed
- Fix #8, Adjusted vscode min version to `v1.83.0`
- Fix #9, Disable ninja auto-install on linux aarch64 systems
- Fix #10, Python selection on linux

## [0.9.0] - 2023-12-16

### Changed
-  Fixes custom Python path not used by CMake
- Automatic Python3 installation is now supported on macOS via `pyenv`.
- Git is now a requirement for macOS with a message for easy installation by running `xcode-select --install`

## [0.8.2] - 2023-12-15

### Changed
-  Fixes Python and git download redirects

## [0.8.1] - 2023-12-14

### Added
- Webview based project generation

### Changed
- many different things I don't have time time to currently list separately

## [0.8.0] - 2023-12-05

## [0.7.3] - 2023-11-13

### Changed
- Fixed spacing in error messages
- Having `pioasm` and `elf2uf2` in path will now skip compiler check

## [0.7.2] - 2023-11-06

### Changed
- Added git and native compiler requirement checks
- Better missing requirements error messages
- Removed "reload VS Code" warning

## [0.7.1] - 2023-11-03

### Changed
- Uses POSIX paths for compiler and debugger on Windows
- Lowered VS Code min version to v1.83.0

## [0.7.0] - 2023-11-02

### Changed
- Updated dependencies
- Fixed gdb path on Windows
- Replaced SDK download system with git
- SDK submodules are now initialized (Fixes #2)
- Replace `HOME` environment variable on Windows with `USERPROFILE`
- Mention git and tar as dependencies in README
- Removed deleted commands from package.json

## [0.6.0] - 2023-10-01

### Changed
- Updated dependencies
- Replaced the global-env system with with sdk-toolchain management
- Updated ECMA script version to `ES2023`

### Removed
- `vscode-windows-registry` dependency
- Windows install detection and the depdendency on `pico-sdk-manager` for Linux and macOS systems

## [0.5.1] - 2023-09-20

### Changed
- Min VS Code version is now v1.82.0
- Updated dependencies

## [0.5.0] - 2023-08-09

### Added
- `raspberry-pi-pico.editSdks` command to modify installed sdks 

## [0.4.2] - 2023-07-27

### Changes
- Fixed PATH separator cross-platform\
- Add `.bashrc` to global path files
- Dependencies update

### Removed
- Unnecessary tkinter requirement

## [0.4.1] - 2023-07-16

### Changes
- Fixed SDK & Toolchain detection on Windows when only uninstaller detection works
- Fixed timeout on slower machines
- Fixed environment for pico project generator

## [0.4.0] - 2023-07-15

### Changes
- Dependencies update
- Add wireless and code generator options to `newProject` command
- Add more warning message concerning the environment variables
- Set current `process.env` when updating global vars

## [0.3.0] - 2023-07-12

### Changes
- Dependencies update
- Add fix Windows reg script util (not included in extension, just for debugging)
- Installed Pico SDK (and toolchain) detection from existing environment variables disabled
- Add Pico SDK (and toolchain) detection from uninstallers on Windows

## [0.2.1] - 2023-07-07

## [0.2.0] - 2023-07-07

## [0.1.0] - 2023-07-06

- Initial release
