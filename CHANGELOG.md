# Change Log

All notable changes to the "raspberry-pi-pico" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Release 1

## [0.17.4] - 2025-02-19

### Fixed
- Prevent extension breaking when new SDK versions are released

### Added
- Added SwitchBuildType command to switch between CMake build types

## [0.17.3] - 2025-01-23

### Added
- Create empty compile_commands.json, to prevent the intellisense warning when creating a new project
- Added support for looking into PICO_BOARD_HEADER_DIRS when switching board (#123)
- Added progress bar when downloading examples
- Added note about what Features do on the project creation page (#151)

### Fixed
- Fixed Risc-V selection for Pico 2 W
- Initialise submodules when they're missing from existing SDK download (eg a failed download)
- Removed environment dependence from pico_project.py, now passing everything as arguments (#128)
- Fixed run from RAM option
- Fixed bug where project creation pages always start with a blip of light mode before switching to dark
- Improve python path handling with invalid or unsupported python versions (#155, #156)

## [0.17.2] - 2024-11-25

### Added
- Added support for SDK 2.1.0 and Pico 2 W

### Fixed
- Keep extension recommendations when importing project (#121)

## [0.17.1] - 2024-11-07

### Fixed
- Fixed tools download error when using a GitHub PAT (#117)

## [0.17.0] - 2024-10-31

### Added
- Add useCmakeTools advanced option when creating projects, to switch the extension to use the CMake Tools integration (#46, #91)
- Detailed download progress (#92)
- Check git version is >2.28 before using system Git (#93)
- Machine scoped python handling, rather than per-project (#94)
- CMake Clean command
- Add PICO_BOARD line to imported projects if it's not already present to enable board switching (#46, #113, #115)

### Changed
- Pico SDK version selector is now an advanced option for examples, as they are only guaranteed to work with the latest SDK (#97)

### Fixed
- Use Got download backend for x86_64 Linux too, due to occasional bugs with Undici (#86)
- Update to pico-sdk-tools v2.0.0-5 to statically link binaries (#90)
- CMake Configure wasn't being awaited (#98)
- Fix CMake Do Not Edit header grammar (#103)
- Fix cmake-kits.json file when switching boards (#107)

## [0.16.2] - 2024-09-17

### Added
- MicroPico integration, for creating MicroPython projects (#85)

### Fixed
- Pico Wireless Options passing to the project generator
- Update to pico-sdk-tools v2.0.0-4 to remove requirement on libgpiod on non-arm64 Linux (#84)

## [0.16.1] - 2024-09-13

### Added
- getPicotoolPath command to download picotool and return the path

### Fixed
- Python, Ninja and CMake mode selector
- f-string expression contained a backslash, preventing project creation on Linux (#82)
- Downloads on Raspberry Pi 4 - two download backends now available: Got on Linux Arm64, and Undici on other platforms

## [0.16.0] - 2024-09-11

### Added
- Gitignore file to generated projects (#56)
- More examples (#61, #80)
- New RISC-V toolchains and a picotool selection
- New Project shortcut in empty explorer panel
- Debug build of the extension with extra logging
- Keyboard support for examples selection
- Restore Webview functionality for "Import" and "From Example" wizards
- ARM Toolchain 13.3 to the list of supported toolchains
- `Flash (SWD)` command for flashing over SWD
- Support for entry point file name defaulting to `main.c` (#60)
- UART feature for the new project wizard
- An uninstaller for SDKs and tools installed by the extension

### Changed
- Updated README.md with new instructions and presentation (#43, #40)
- Updated dependencies
- Improved downloading of SDKs and tools
- Switch board command now includes a selector for RISC-V
- Use extension dependencies rather than extension pack (#59)
- Fix launch target path contains backslashes (#67)
- Fix launch.json synatx
- Fix minor webview presentation issues like loading of default project location or missing borders
- Better logging
- GitHub expired or invalid PAT handling and user feedback
- Improved labeling of action artifacts
- Fix python selection
- Fix SDK selector gets disabled if an example is selected (#71)
- Fix multiple issues where the webview would crash
- Fix webview disposing before setting html which would crash the editor panel without proper error handling
- Upgrade downloaded portable git on Windows x64 to 2.46.0
- Fix webview bugs related to the different layout for the "Import" and "From Example" wizard (#80)
- New style for the RISC-V selector in the new project wizard
- Fix option disablement in the new project from example wizard
- Fix a Git cloning issue on Windows (#73 thanks to @pxysource in #74)
- Conditional import of the pico-vscode.cmake script (thanks to @Mr-Bossman in #65)
- Fix missing OpenOCD adapter on Raspberry Pi OS and other Linux distributions (#62)
- Update to pico-sdk-tools v2.0.0-3
- Fix import webview null-pointer exceptions
- Fixed some minor issues in the Github workflows
- Fix project name validation for non example based projects
- Disabled saving of the last project location for project imports

### Removed
- Legacy code
- Legacy compiler check
- Add examples code-gen option from the new project wizard

## [0.15.2] - 2024-08-23

### Added
- Switch board command, for simple switching between boards

### Fixed
- Fix download issues by switching to new library (#47)
- Fix switching SDK versions with unsupported PICO_BOARD (#36)
- Fix moved force include (#30)

### Changed
- Use a common pico-vscode.cmake include file, and change the DO NEVER EDIT section (#41)
- Replace project location placeholders with platform dependent hints (#44)

## [0.15.1] - 2024-08-09

### Fixed
- Fix project compilation after moving build directory (#29)
- Fix issues with debugging with spaces in the path
- Fix pioasm path

### Changed
- No longer packaged as pre-release, to remove additional prompt when installing the extension

## [0.15.0] - 2024-08-08

### Added
- RP2350 support, with SDK 2.0.0
- Picotool now included
- Run button, which uses picotool to flash the device over USB

### Fixed
- Fix missing quotes around gitExecutable (#25)

### Changed
- If GitHub API rate limit is reached, now downloads a cached response from GitHub pages
- Checks for non-empty target directories, to make retrying installations simpler

## [0.14.0] - 2024-06-28

### Fixed
- Fix NewProjectPanel persistent state (#2)
- Make c_cpp_properties platform independent (#1)
- Improve behaviour when switching SDKs (@paulober)
- Throw error when debugging if compilation failed (#19)
- Use gdb-multiarch on x86_64 linux (#16)
- Fix git download on first use of extension

### Changed
- Use GitHub API for downloads, if a GitHub PAT has been setup (#18)
- Use Ninja version 1.12.1 as it now has aarch64 binaries for linux
- Add default API responses when rate limit is hit
- Add extension pack to download the recommended extensions by default

## [0.13.1] - 2024-05-08

### Fixed

- Fix concurrency with Compile Project task (#14)
- Fix Flash task bugs (#13)
- Fix PICO_TOOLCHAIN_PATH in Windows integrated terminal

## [0.13.0] - 2024-04-22

### Added

- Generate compile_commands.json, for better intellisense (@will-v-pi)
- Support for compiling with the cmake-tools extension (@will-v-pi)

### Changed

- Fix compilation on Windows, when Git Bash used as default shell (@paulober)
- Now uses downloaded GDB on MacOS by default (@will-v-pi)
- Fix some examples generation bugs (@will-v-pi)
- Fix high contrast theming (@paulober)
- Fix ninja download on Linux (@will-v-pi)

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
