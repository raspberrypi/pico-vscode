# Locations of files
This is a list of files downloaded by the extension, and where they're installed. If the extension fails to download something, then you can manually install these files to the specified locations and still be able to use the extension.

> Note `~` is used to denote the user's home directory, and anything enclosed by `<...>` is a variable you should replace

## SDK
Installed at `~/.pico-sdk/sdk/<sdk_version>/`, where `sdk_version` is a release (eg 1.5.1 or 2.0.0). Can be manually installed using git
```
git -c advice.detachedHead=false clone --branch <sdk_version> https://github.com/raspberrypi/pico-sdk.git "~/.pico-sdk/sdk/<sdk_version>"
cd "~/.pico-sdk/sdk/<sdk_version>"
git submodule update --init
```

## Examples
Installed at `~/.pico-sdk/examples/` - the extension does a sparse checout, but if doing this manually you can use a full checkout
```
git -c advice.detachedHead=false clone --branch master https://github.com/raspberrypi/pico-examples.git "~/.pico-sdk/examples"
```

## CMake
Installed at `~/.pico-sdk/cmake/<version>/`. See [data/<extension_version>/github-cache.json](data/0.15.0/github-cache.json) for the download links - search for `cmake-<version>-` and download the `browser_download_url` for your platform (`.zip` files for Windows, `.tar.gz` files for others). Unzip this into `~/.pico-sdk/cmake/<version>/`, so the cmake executable is at `~/.pico-sdk/cmake/<version>/bin/cmake`.

On MacOS, you'll also need to symlink the `CMake.app/Contents/bin` directory to the root, so you have the structure `~/.pico-sdk/cmake/<version>/bin/`

## Ninja
Installed at `~/.pico-sdk/ninja/<version>/`. See [data/<extension_version>/github-cache.json](data/0.15.0/github-cache.json) for the download links - search for `ninja-` and download the `browser_download_url` for your platform. Unzip this into `~/.pico-sdk/ninja/<version>/`, so the ninja executable is at `~/.pico-sdk/ninja/<version>/ninja`.

## OpenOCD
Installed at `~/.pico-sdk/openocd/<version>/`. See [data/<extension_version>/github-cache.json](data/0.15.0/github-cache.json) for the download links - search for `openocd-<version>` and download the `browser_download_url` for your platform. Unzip this into `~/.pico-sdk/openocd/<version>/`, so the openocd executable is at `~/.pico-sdk/openocd/<version>/openocd`.

## Picotool
Installed at `~/.pico-sdk/picotool/<version>/`. See [data/<extension_version>/github-cache.json](data/0.15.0/github-cache.json) for the download links - search for `picotool-<version>` and download the `browser_download_url` for your platform. Unzip this into `~/.pico-sdk/picotool/<version>/`, so the picotool executable is at `~/.pico-sdk/picotool/<version>/picotool/picotool`.

## Python
More complex, so if the extension hasn't managed to install it, then you'll need to install it manually for your system and the extension will use that (provided it is in your PATH).

## Toolchain
Installed at `~/.pico-sdk/toolchain/<version>/`. See [data/<extension_version>/supportedToolchains.ini](data/0.15.0/supportedToolchains.ini) for download links - the version is in square brackets, and there are download links for all the platforms. Unzip this into `~/.pico-sdk/toolchain/<version>/`, so the <gcc-trip-le>-gcc executable is at `~/.pico-sdk/toolchain/<version>/bin/<gcc-trip-le>-gcc`

## SDK Tools
Only required on Windows, but recommended for all platforms. Installed at `~/.pico-sdk/tools/<version>/`. See [data/<extension_version>/github-cache.json](data/0.15.0/github-cache.json) for the download links - search for `pico-sdk-tools-<version>` and download the `browser_download_url` for your platform. Unzip this into `~/.pico-sdk/tools/<version>/`, so the pioasm executable is at `~/.pico-sdk/tools/<version>/pioasm/pioasm` for versions >=2.0.0, or `~/.pico-sdk/tools/<version>/pioasm` for lower versions.
