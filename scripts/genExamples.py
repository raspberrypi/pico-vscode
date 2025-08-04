#!/usr/bin/env python3

import os
import glob
import shutil
import json
import multiprocessing
import configparser
import platform

from pico_project import GenerateCMake, copyExampleConfigs

# This script is designed to be run on Linux
assert platform.system() == "Linux"

boards = ["pico", "pico_w", "pico2", "pico2_w"]

platforms = {
    "pico": ["rp2040"],
    "pico_w": ["rp2040"],
    "pico2": ["rp2350-arm-s", "rp2350-riscv"],
    "pico2_w": ["rp2350-arm-s", "rp2350-riscv"],
}

examples = {
    "example_format": {
        "path": "hello_world/usb",
        "name": "usb",
        "libPaths": [],
        "libNames": [],
        "boards": [],
        "supportRiscV": False,
    }
}

examples.clear()

CURRENT_DATA_VERSION = "0.17.0"

SDK_VERSION_DEFAULT = "2.2.0"
ARM_TOOLCHAIN_VERSION_DEFAULT = "14_2_Rel1"
RISCV_TOOLCHAIN_VERSION_DEFAULT = "RISCV_ZCB_RPI_2_1_1_3"


def env_get_default(env_var, default):
    value = os.environ.get(env_var, default)
    if value == "default":
        # The action passes default in the environment variable
        value = default
    return value


SDK_VERSION = env_get_default("SDK_VERSION", SDK_VERSION_DEFAULT)
ARM_TOOLCHAIN_VERSION = env_get_default(
    "ARM_TOOLCHAIN_VERSION", ARM_TOOLCHAIN_VERSION_DEFAULT
)
RISCV_TOOLCHAIN_VERSION = env_get_default(
    "RISCV_TOOLCHAIN_VERSION", RISCV_TOOLCHAIN_VERSION_DEFAULT
)

# To test with develop SDK, uncomment the line below - this will clone the SDK & picotool, and build picotool & pioasm
# note: the 2- is required due to a VERSION_LESS check in pico-vscode.cmake
# SDK_VERSION = "2-develop"

BUILD_TOOLS = not os.path.exists(os.path.expanduser(f"~/.pico-sdk/sdk/{SDK_VERSION}"))

if "develop" in SDK_VERSION:
    SDK_BRANCH = "develop"
    PICOTOOL_BRANCH = "develop"
    EXAMPLES_BRANCH = "develop"
    BUILD_TOOLS = True  # Always clone & build the latest when using develop
else:
    SDK_BRANCH = SDK_VERSION
    PICOTOOL_BRANCH = SDK_VERSION
    EXAMPLES_BRANCH = f"sdk-{SDK_VERSION}"

# Platform & toolchain setup
platform = "linux_x64" if platform.machine() == "x86_64" else "linux_arm64"
config = configparser.ConfigParser()
config.read(
    f"{os.path.dirname(os.path.realpath(__file__))}/../data/{CURRENT_DATA_VERSION}/supportedToolchains.ini"
)

# Download arm toolchain if not already downloaded
if not os.path.exists(
    os.path.expanduser(f"~/.pico-sdk/toolchain/{ARM_TOOLCHAIN_VERSION}")
):
    toolchain_url = config[ARM_TOOLCHAIN_VERSION][platform]
    os.makedirs(
        os.path.expanduser(f"~/.pico-sdk/toolchain/{ARM_TOOLCHAIN_VERSION}"),
        exist_ok=True,
    )
    os.system(f"wget {toolchain_url}")
    os.system(
        f"tar -xf {toolchain_url.split('/')[-1]} --strip-components 1 -C ~/.pico-sdk/toolchain/{ARM_TOOLCHAIN_VERSION}"
    )
    os.system(f"rm {toolchain_url.split('/')[-1]}")

# Download riscv toolchain if not already downloaded
if not os.path.exists(
    os.path.expanduser(f"~/.pico-sdk/toolchain/{RISCV_TOOLCHAIN_VERSION}")
):
    toolchain_url = config[RISCV_TOOLCHAIN_VERSION][platform]
    os.makedirs(
        os.path.expanduser(f"~/.pico-sdk/toolchain/{RISCV_TOOLCHAIN_VERSION}"),
        exist_ok=True,
    )
    os.system(f"wget {toolchain_url}")
    os.system(
        f"tar -xf {toolchain_url.split('/')[-1]} -C ~/.pico-sdk/toolchain/{RISCV_TOOLCHAIN_VERSION}"
    )
    os.system(f"rm {toolchain_url.split('/')[-1]}")

# Copy pico-vscode.cmake to ~/.pico-sdk/cmake/pico-vscode.cmake
os.makedirs(os.path.expanduser("~/.pico-sdk/cmake"), exist_ok=True)
shutil.copy(
    f"{os.path.dirname(os.path.realpath(__file__))}/pico-vscode.cmake",
    os.path.expanduser("~/.pico-sdk/cmake/pico-vscode.cmake"),
)

if BUILD_TOOLS:
    # Clone pico-sdk
    try:
        shutil.rmtree(os.path.expanduser(f"~/.pico-sdk/sdk/{SDK_VERSION}"))
    except FileNotFoundError:
        pass
    os.system(
        f"git -c advice.detachedHead=false clone https://github.com/raspberrypi/pico-sdk.git --depth=1 --branch {SDK_BRANCH} --recurse-submodules --shallow-submodules ~/.pico-sdk/sdk/{SDK_VERSION}"
    )

    # Clone & build picotool
    try:
        shutil.rmtree("picotool")
    except FileNotFoundError:
        pass
    try:
        shutil.rmtree("picotool-build")
    except FileNotFoundError:
        pass
    try:
        shutil.rmtree(os.path.expanduser(f"~/.pico-sdk/picotool/{SDK_VERSION}"))
    except FileNotFoundError:
        pass
    os.system(
        f"git -c advice.detachedHead=false clone https://github.com/raspberrypi/picotool.git --depth=1 --branch {PICOTOOL_BRANCH}"
    )
    os.system(
        f"cmake -S picotool -B picotool-build -GNinja -DPICO_SDK_PATH=~/.pico-sdk/sdk/{SDK_VERSION} -DPICOTOOL_FLAT_INSTALL=1 -DPICOTOOL_NO_LIBUSB=1"
    )
    os.system(f"cmake --build picotool-build")
    os.system(
        f"cmake --install picotool-build --prefix ~/.pico-sdk/picotool/{SDK_VERSION}"
    )

    # Build pioasm
    try:
        shutil.rmtree("pioasm-build")
    except FileNotFoundError:
        pass
    try:
        shutil.rmtree(os.path.expanduser(f"~/.pico-sdk/tools/{SDK_VERSION}"))
    except FileNotFoundError:
        pass
    os.system(
        f"cmake -S ~/.pico-sdk/sdk/{SDK_VERSION}/tools/pioasm -B pioasm-build -GNinja -DPIOASM_FLAT_INSTALL=1 -DPIOASM_VERSION_STRING={SDK_VERSION}"
    )
    os.system(f"cmake --build pioasm-build")
    os.system(f"cmake --install pioasm-build --prefix ~/.pico-sdk/tools/{SDK_VERSION}")

try:
    shutil.rmtree("pico-examples")
except FileNotFoundError:
    pass
try:
    for path in glob.glob("errors-pico*"):
        shutil.rmtree(path)
except FileNotFoundError:
    pass
os.system(
    f"git -c advice.detachedHead=false clone https://github.com/raspberrypi/pico-examples.git --depth=1 --branch {EXAMPLES_BRANCH}"
)

PICO_SDK_PATH = f"~/.pico-sdk/sdk/{SDK_VERSION}"
configure_env = {
    "PICO_SDK_PATH": PICO_SDK_PATH,
    "WIFI_SSID": "Your Wi-Fi SSID",
    "WIFI_PASSWORD": "Your Wi-Fi Password",
    "TEST_TCP_SERVER_IP": "192.168.1.100",  # This isn't read from environment variables, so also needs to be passed to cmake
    "MQTT_SERVER": "myMQTTserver",
}

os.environ["CFLAGS"] = "-Werror=cpp"
os.environ["CXXFLAGS"] = "-Werror=cpp"

updated_examples = set()

for board in boards:
    for platform in platforms[board]:
        try:
            shutil.rmtree("build")
        except FileNotFoundError:
            pass
        toolchainVersion = (
            RISCV_TOOLCHAIN_VERSION if "riscv" in platform else ARM_TOOLCHAIN_VERSION
        )
        toolchainPath = f"~/.pico-sdk/toolchain/{toolchainVersion}"
        picotoolDir = f"~/.pico-sdk/picotool/{SDK_VERSION}/picotool"

        # Setup env to find targets
        for k, v in configure_env.items():
            os.environ[k] = v

        os.system(
            f"cmake -S pico-examples -B build -DPICO_BOARD={board} -DPICO_PLATFORM={platform} -DPICO_TOOLCHAIN_PATH={toolchainPath} -Dpicotool_DIR={picotoolDir} -DTEST_TCP_SERVER_IP=$TEST_TCP_SERVER_IP"
        )

        os.system("cmake --build build --target help > targets.txt")

        # Clear env for clean tests
        for k in configure_env.keys():
            del os.environ[k]

        targets = []

        with open("targets.txt", "r") as f:
            for line in f.readlines():
                target = line.strip(".").strip()
                if (
                    "all" in target
                    or "build_variant" in target
                    or target == "clean"
                    or target == "depend"
                    or target == "edit_cache"
                    or target == "rebuild_cache"
                    or target.endswith("_pio_h")
                    or target.endswith("_poll")
                ):
                    continue
                if target.endswith("_background"):
                    target = target[: -len("_background")]
                targets.append(target)

        walk_dir = "./pico-examples"
        target_locs = {}
        lib_locs = {}

        for root, subdirs, files in os.walk(walk_dir):
            for filename in files:
                if filename != "CMakeLists.txt":
                    continue
                file_path = os.path.join(root, filename)

                with open(file_path, "r") as f:
                    f_content = f.read()
                    if "add_library" in f_content:
                        for target in targets:
                            if f"add_library({target}" in f_content:
                                tmp = lib_locs.get(target, {"locs": []})
                                tmp["locs"].append(file_path)
                                lib_locs[target] = tmp
                    if "add_executable" in f_content:
                        exes = []
                        for target in targets:
                            if (
                                f"pico_add_extra_outputs({target})" in f_content
                                or f"pico_add_extra_outputs({target}_background)"
                                in f_content
                            ):
                                exes.append(target)
                                tmp = target_locs.get(target, {"locs": [], "libs": []})
                                tmp["locs"].append(file_path)
                                target_locs[target] = tmp

        for k, v in target_locs.items():
            if len(v["locs"]) > 1:
                raise ValueError(f"Too many locs {v}")
            target_locs[k]["loc"] = v["locs"][0]
            with open(v["locs"][0], "r") as f:
                f_content = f.read()
                for lib in lib_locs:
                    if lib in f_content:
                        target_locs[k]["libs"].append(lib)

        for k, v in lib_locs.items():
            if len(v["locs"]) > 1:
                raise ValueError(f"Too many locs {v}")
            lib_locs[k]["loc"] = v["locs"][0]

        # Test build them all

        # Test build function
        def test_build(target, v):
            dir = f"tmp-{target}"
            try:
                shutil.rmtree(dir)
            except FileNotFoundError:
                pass
            try:
                shutil.rmtree(f"{dir}-build")
            except FileNotFoundError:
                pass

            os.mkdir(f"{dir}-build")
            loc = v["loc"]
            loc = loc.replace("/CMakeLists.txt", "")
            shutil.copytree(loc, dir)
            if len(v["libs"]):
                for lib in v["libs"]:
                    shutil.copytree(
                        lib_locs[lib]["loc"].replace("/CMakeLists.txt", ""),
                        f"{dir}/{lib}",
                    )
            params = {
                "projectName": target,
                "wantOverwrite": True,
                "wantConvert": True,
                "wantExample": True,
                "boardtype": board,
                "sdkVersion": SDK_VERSION,
                "toolchainVersion": toolchainVersion,
                "picotoolVersion": SDK_VERSION,
                "exampleLibs": v["libs"],
            }
            GenerateCMake(dir, params)
            copyExampleConfigs(dir)

            shutil.copy(
                os.path.expanduser(f"{PICO_SDK_PATH}/external/pico_sdk_import.cmake"),
                f"{dir}/",
            )

            retcmake = os.system(f"cmake -S {dir} -B {dir}-build -GNinja")
            retbuild = os.system(f"cmake --build {dir}-build")
            ret = None
            if retcmake or retbuild:
                print(
                    f"Error occurred with {target} {v} - cmake {retcmake}, build {retbuild}"
                )
                shutil.copytree(dir, f"errors-{board}-{platform}/{target}")
            else:
                ret = (target, v, loc)

            shutil.rmtree(dir)
            shutil.rmtree(f"{dir}-build")
            return ret

        with multiprocessing.Pool(processes=os.cpu_count()) as pool:
            ret = pool.starmap(
                test_build,
                [(target, v) for target, v in target_locs.items()],
            )
            ret = filter(lambda x: x != None, ret)
            for target, v, loc in ret:
                if examples.get(target) != None:
                    example = examples[target]
                    assert example["path"] == loc.replace(f"{walk_dir}/", "")
                    assert example["name"] == target
                    assert example["libPaths"] == [
                        lib_locs[lib]["loc"]
                        .replace("/CMakeLists.txt", "")
                        .replace(f"{walk_dir}/", "")
                        for lib in v["libs"]
                    ]
                    assert example["libNames"] == v["libs"]
                    if not board in example["boards"]:
                        example["boards"].append(board)
                    example["supportRiscV"] |= "riscv" in platform
                else:
                    examples[target] = {
                        "path": loc.replace(f"{walk_dir}/", ""),
                        "name": target,
                        "libPaths": [
                            lib_locs[lib]["loc"]
                            .replace("/CMakeLists.txt", "")
                            .replace(f"{walk_dir}/", "")
                            for lib in v["libs"]
                        ],
                        "libNames": v["libs"],
                        "boards": [board],
                        "supportRiscV": "riscv" in platform,
                    }
        # Write out after each platform
        with open(
            f"{os.path.dirname(os.path.realpath(__file__))}/../data/{CURRENT_DATA_VERSION}/examples.json",
            "r",
        ) as f:
            current_examples = json.load(f)

        current_examples.update(examples)
        updated_examples.update(examples.keys())

        with open(
            f"{os.path.dirname(os.path.realpath(__file__))}/../data/{CURRENT_DATA_VERSION}/examples.json",
            "w",
        ) as f:
            json.dump(current_examples, f, indent=4)

# Finalise list, removing any examples no longer supported
with open(
    f"{os.path.dirname(os.path.realpath(__file__))}/../data/{CURRENT_DATA_VERSION}/examples.json",
    "r",
) as f:
    current_examples = dict(json.load(f))

current_examples = {k: v for k, v in current_examples.items() if k in updated_examples}

with open(
    f"{os.path.dirname(os.path.realpath(__file__))}/../data/{CURRENT_DATA_VERSION}/examples.json",
    "w",
) as f:
    json.dump(current_examples, f, indent=4)
