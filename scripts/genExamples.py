#!/usr/bin/env python3

import os
import glob
import shutil
import json
import multiprocessing

from pico_project import GenerateCMake

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

SDK_VERSION = "2.1.1"

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
    f"git -c advice.detachedHead=false clone https://github.com/raspberrypi/pico-examples.git --depth=1 --branch sdk-{SDK_VERSION}"
)
os.environ["PICO_SDK_PATH"] = f"~/.pico-sdk/sdk/{SDK_VERSION}"
os.environ["WIFI_SSID"] = "Your Wi-Fi SSID"
os.environ["WIFI_PASSWORD"] = "Your Wi-Fi Password"
os.environ["TEST_TCP_SERVER_IP"] = (
    "192.168.1.100"  # This isn't read from environment variables, so also needs to be passed to cmake
)
os.environ["MQTT_SERVER"] = "myMQTTserver"
os.environ["CFLAGS"] = "-Werror=cpp"
os.environ["CXXFLAGS"] = "-Werror=cpp"

ordered_targets = []

for board in boards:
    for platform in platforms[board]:
        try:
            shutil.rmtree("build")
        except FileNotFoundError:
            pass
        toolchainVersion = (
            "RISCV_ZCB_RPI_2_1_1_3" if "riscv" in platform else "14_2_Rel1"
        )
        toolchainPath = f"~/.pico-sdk/toolchain/{toolchainVersion}"
        picotoolDir = f"~/.pico-sdk/picotool/{SDK_VERSION}/picotool"
        os.system(
            f"cmake -S pico-examples -B build -DPICO_BOARD={board} -DPICO_PLATFORM={platform} -DPICO_TOOLCHAIN_PATH={toolchainPath} -Dpicotool_DIR={picotoolDir} -DTEST_TCP_SERVER_IP=$TEST_TCP_SERVER_IP"
        )

        os.system("cmake --build build --target help > targets.txt")

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
            if os.path.exists(f"{dir}/lwipopts.h"):
                with open(f"{dir}/lwipopts.h", "r") as f:
                    if "lwipopts_examples_common.h" in f.read():
                        # Write lwipopts for examples
                        shutil.copy(
                            f"{os.path.dirname(os.path.realpath(__file__))}/lwipopts.h",
                            f"{dir}/lwipopts_examples_common.h",
                        )

            if os.path.exists(f"{dir}/mbedtls_config.h"):
                with open(f"{dir}/mbedtls_config.h", "r") as f:
                    if "mbedtls_config_examples_common.h" in f.read():
                        # Write mbedtls_config for examples
                        shutil.copy(
                            f"{os.path.dirname(os.path.realpath(__file__))}/mbedtls_config.h",
                            f"{dir}/mbedtls_config_examples_common.h",
                        )
            shutil.copy("pico-examples/pico_sdk_import.cmake", f"{dir}/")

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

        ordered_targets.extend(target_locs.keys())

        with multiprocessing.Pool(processes=22) as pool:
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
            "w",
        ) as f:
            sorted_examples = dict(
                sorted(examples.items(), key=lambda x: ordered_targets.index(x[0]))
            )
            json.dump(sorted_examples, f, indent=4)
