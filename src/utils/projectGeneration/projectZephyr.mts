/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/naming-convention */
import { join } from "path";
import { dirname as dirnamePosix } from "path/posix";
import Logger, { LoggerSource } from "../../logger.mjs";
import { unknownErrorToString } from "../errorHelper.mjs";
import { extensionName } from "../../commands/command.mjs";
import { commands, Uri, window, workspace } from "vscode";
import {
  CURRENT_DTC_VERSION,
  CURRENT_GPERF_VERSION,
  CURRENT_WGET_VERSION,
} from "../sharedConstants.mjs";
import type { VersionBundle } from "../versionBundles.mjs";
import { HOME_VAR } from "../../settings.mjs";
import { TextEncoder } from "util";
import {
  BoardType,
  ZephyrProjectBase,
  type ZephyrSubmitMessageValue,
} from "../../webview/sharedEnums.mjs";
import {
  WIFI_HTTP_C,
  WIFI_HTTP_H,
  WIFI_JSON_DEFINITIONS_H,
  WIFI_PING_C,
  WIFI_PING_H,
  WIFI_PRJ_CONF,
  WIFI_WIFI_C,
  WIFI_WIFI_H,
} from "./zephyrFiles.mjs";
import { homedir } from "os";
import {
  GET_CHIP_UPPERCASE,
  GET_OPENOCD_ROOT,
  GET_PICOTOOL_PATH,
  GET_TARGET,
  GET_WEST_PATH,
  GET_ZEPHYR_WORKSPACE_PATH,
} from "../../commands/cmdIds.mjs";

// Kconfig snippets
const shellWifiKconfig: string = `CONFIG_WIFI_LOG_LEVEL_ERR=y
CONFIG_NET_L2_WIFI_SHELL=y
CONFIG_NET_SHELL=y
`;

/**
 * Convert the enum to the Zephyr board name
 *
 * @param e BoardType enum
 * @returns string Zephyr board name
 * @throws Error if unknown board type
 */
function enumToBoard(e: BoardType): string {
  switch (e) {
    case BoardType.pico:
      return "rpi_pico";
    case BoardType.picoW:
      return "rpi_pico/rp2040/w";
    case BoardType.pico2:
      return "rpi_pico2/rp2350a/m33";
    case BoardType.pico2W:
      return "rpi_pico2/rp2350a/m33/w";
    default:
      throw new Error(`Unknown Board Type: ${e as string}`);
  }
}

async function generateVSCodeConfig(
  projectRoot: string,
  latestVb: [string, VersionBundle],
  ninjaPath: string,
  cmakePath: string,
  te: TextEncoder = new TextEncoder(),
  data: ZephyrSubmitMessageValue
): Promise<boolean> {
  const vsc = join(projectRoot, ".vscode");

  // create extensions.json
  const extensions = {
    recommendations: [
      "marus25.cortex-debug",
      "ms-vscode.cpptools",
      "ms-vscode.cmake-tools",
      "ms-vscode.vscode-serial-monitor",
      "raspberry-pi.raspberry-pi-pico",
    ],
  };

  // TODO: why run, maybe to make sure installed but that should be done before!
  const openOCDPath: string | undefined = await commands.executeCommand(
    `${extensionName}.${GET_OPENOCD_ROOT}`
  );
  if (!openOCDPath) {
    Logger.error(LoggerSource.projectRust, "Failed to get OpenOCD path");

    void window.showErrorMessage("Failed to get OpenOCD path");

    return false;
  }

  const cppProperties = {
    version: 4,
    configurations: [
      {
        name: "Zephyr",
        intelliSenseMode: "linux-gcc-arm",
        compilerPath:
          // TODO: maybe move into command (the part before the executable) / test if not .exe works on win32
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr-sdk/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc",
        includePath: [
          "${workspaceFolder}/**",
          "${workspaceFolder}/build/zephyr/include",
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr/include",
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr/modules/cmsis_6",
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr/modules/hal_infineon",
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr/modules/hal_rpi_pico",
        ],
        compileCommands: "${workspaceFolder}/build/compile_commands.json",
        cppStandard: "gnu++20",
        cStandard: "gnu17",
        forcedInclude: [
          "${userHome}/.pico-sdk/zephyr_workspace/zephyr/include/zephyr/devicetree.h",
          "${workspaceFolder}/build/zephyr/include/generated/zephyr/autoconf.h",
          "${workspaceFolder}/build/zephyr/include/generated/zephyr/version.h",
        ],
      },
    ],
  };

  const launch = {
    version: "0.2.0",
    configurations: [
      {
        name: "Pico Debug (Zephyr)",
        cwd: "${workspaceFolder}",
        // TODO: command launch target path?
        executable: "${workspaceFolder}/build/zephyr/zephyr.elf",
        request: "launch",
        type: "cortex-debug",
        servertype: "openocd",
        // TODO: maybe svd file
        serverpath: `\${command:${extensionName}.${GET_OPENOCD_ROOT}}/openocd`,
        searchDir: [`\${command:${extensionName}.${GET_OPENOCD_ROOT}}/scripts`],
        toolchainPrefix: "arm-zephyr-eabi",
        armToolchainPath:
          // TODO: maybe just full get zephyr compiler path command
          `\${command:${extensionName}.${GET_ZEPHYR_WORKSPACE_PATH}}/zephyr-sdk/arm-zephyr-eabi/bin`,
        // TODO: get chip dynamically maybe: chip: `\${command:${extensionName}.${GetChipCommand.id}}`,
        // meaning only one cfg required
        device: `\${command:${extensionName}.${GET_CHIP_UPPERCASE}}`,
        svdFile: `\${userHome}/.pico-sdk/sdk/${latestVb[0]}/src/\${command:${extensionName}.getChip}/hardware_regs/\${command:${extensionName}.${GET_CHIP_UPPERCASE}}.svd`,
        configFiles: [
          "interface/cmsis-dap.cfg",
          `target/\${command:${extensionName}.${GET_TARGET}}.cfg`,
        ],
        runToEntryPoint: "main",
        // Fix for no_flash binaries, where monitor reset halt doesn't do what is expected
        // Also works fine for flash binaries
        openOCDLaunchCommands: ["adapter speed 5000"],
        // TODO: add zephyr build support to support this.
        rtos: "Zephyr",
      },
    ],
  };

  const settings = {
    "cmake.options.statusBarVisibility": "hidden",
    "cmake.options.advanced": {
      build: {
        statusBarVisibility: "hidden",
      },
      launch: {
        statusBarVisibility: "hidden",
      },
      debug: {
        statusBarVisibility: "hidden",
      },
    },
    "cmake.configureOnEdit": false,
    "cmake.automaticReconfigure": false,
    "cmake.configureOnOpen": false,
    "cmake.generator": "Ninja",
    "cmake.cmakePath": "",
    "C_Cpp.debugShortcut": false,
    "terminal.integrated.env.windows": {
      Path: `\${env:USERPROFILE}/.pico-sdk/dtc/${CURRENT_DTC_VERSION}/bin;\${env:USERPROFILE}/.pico-sdk/gperf/${CURRENT_GPERF_VERSION};\${env:USERPROFILE}/.pico-sdk/wget/${CURRENT_WGET_VERSION};\${env:USERPROFILE}/.pico-sdk/7zip;\${env:Path};`,
    },
    "terminal.integrated.env.osx": {
      PATH: "${env:PATH}:",
    },
    "terminal.integrated.env.linux": {
      PATH: "${env:PATH}:",
    },
    "raspberry-pi-pico.cmakeAutoConfigure": true,
    "raspberry-pi-pico.useCmakeTools": false,
    "raspberry-pi-pico.cmakePath": "",
    "raspberry-pi-pico.ninjaPath": "",
    "editor.formatOnSave": true,
    "search.exclude": {
      "build/": true,
    },
  };

  const posixHomedir = homedir().replaceAll("\\", "/");
  if (ninjaPath.length > 0) {
    const ninjaDir = dirnamePosix(ninjaPath);
    settings[`${extensionName}.ninjaPath`] = ninjaDir.replace(
      posixHomedir,
      HOME_VAR
    );

    // Add to PATH
    const pathWindows = ninjaDir
      .replace(HOME_VAR, "${env:USERPROFILE}")
      .replace(posixHomedir, "${env:USERPROFILE}");
    const pathPosix = ninjaDir
      .replace(HOME_VAR, "${env:HOME}")
      .replace(posixHomedir, "${env:HOME}");

    settings[
      "terminal.integrated.env.windows"
    ].Path = `${pathWindows};${settings["terminal.integrated.env.windows"].Path}`;
    settings[
      "terminal.integrated.env.osx"
    ].PATH = `${pathPosix}:${settings["terminal.integrated.env.osx"].PATH}`;
    settings[
      "terminal.integrated.env.linux"
    ].PATH = `${pathPosix}:${settings["terminal.integrated.env.linux"].PATH}`;
  } else {
    // assume in PATH
    settings[`${extensionName}.ninjaPath`] = "ninja";
  }

  if (cmakePath.length > 0) {
    const cmakeDir = dirnamePosix(cmakePath);

    settings["cmake.cmakePath"] = cmakePath.replace(
      posixHomedir,
      "${userHome}"
    );
    settings[`${extensionName}.cmakePath`] = cmakePath.replace(
      posixHomedir,
      HOME_VAR
    );

    const pathWindows = cmakeDir
      .replace(HOME_VAR, "${env:USERPROFILE}")
      .replace(posixHomedir, "${env:USERPROFILE}");
    const pathPosix = cmakeDir
      .replace(HOME_VAR, "${env:HOME}")
      .replace(posixHomedir, "${env:HOME}");

    // add to path
    settings[
      "terminal.integrated.env.windows"
    ].Path = `${pathWindows};${settings["terminal.integrated.env.windows"].Path}`;
    settings[
      "terminal.integrated.env.osx"
    ].PATH = `${pathPosix}:${settings["terminal.integrated.env.osx"].PATH}`;
    settings[
      "terminal.integrated.env.linux"
    ].PATH = `${pathPosix}:${settings["terminal.integrated.env.linux"].PATH}`;
  } else {
    // assume in PATH
    settings["cmake.cmakePath"] = "cmake";
    settings[`${extensionName}.cmakePath`] = "cmake";
  }

  const westArgs = [
    "build",
    "-p",
    "auto",
    "-b",
    enumToBoard(data.boardType),
    "-d",
    '"${workspaceFolder}/build"',
    '"${workspaceFolder}"',
  ];

  // If console is USB, use the local snippet
  if (data.console === "USB") {
    westArgs.push("-S", "usb_serial_port");
  }

  westArgs.push(
    "--",
    `-DOPENOCD=\${command:${extensionName}.${GET_OPENOCD_ROOT}}/openocd`,
    `-DOPENOCD_DEFAULT_PATH=\${command:${extensionName}.${GET_OPENOCD_ROOT}}/scripts`
  );

  const tasks = {
    version: "2.0.0",
    tasks: [
      {
        label: "Compile Project",
        type: "shell",
        command: `\${command:${extensionName}.${GET_WEST_PATH}}`,
        args: westArgs,
        group: {
          kind: "build",
          isDefault: true,
        },
        presentation: {
          reveal: "always",
          panel: "dedicated",
        },
        problemMatcher: "$gcc",
        options: {
          cwd: `\${command:${extensionName}.${GET_ZEPHYR_WORKSPACE_PATH}}`,
        },
        windows: {
          options: {
            shell: {
              executable: "cmd.exe",
              args: ["/d", "/c"],
            },
          },
        },
      },
      // TODO: test
      {
        label: "Flash",
        type: "shell",
        group: {
          kind: "build",
        },
        command: `\${command:${extensionName}.${GET_WEST_PATH}}`,
        args: ["flash", "--build-dir", '"${workspaceFolder}/build"'],
        options: {
          cwd: `\${command:${extensionName}.${GET_ZEPHYR_WORKSPACE_PATH}}`,
        },
      },
      {
        label: "Run Project",
        type: "shell",
        command: `\${command:${extensionName}.${GET_PICOTOOL_PATH}}`,
        // TODO: support for launch target path command
        args: ["load", '"${workspaceFolder}/build/zephyr/zephyr.elf"', "-fx"],
        presentation: {
          reveal: "always",
          panel: "dedicated",
        },
        problemMatcher: [],
      },
    ],
  };

  try {
    await workspace.fs.createDirectory(Uri.file(vsc));
    await workspace.fs.writeFile(
      Uri.file(join(vsc, "extensions.json")),
      te.encode(JSON.stringify(extensions, null, 2))
    );
    await workspace.fs.writeFile(
      Uri.file(join(vsc, "launch.json")),
      te.encode(JSON.stringify(launch, null, 2))
    );
    await workspace.fs.writeFile(
      Uri.file(join(vsc, "settings.json")),
      te.encode(JSON.stringify(settings, null, 2))
    );
    await workspace.fs.writeFile(
      Uri.file(join(vsc, "tasks.json")),
      te.encode(JSON.stringify(tasks, null, 2))
    );
    await workspace.fs.writeFile(
      Uri.file(join(vsc, "c_cpp_properties.json")),
      te.encode(JSON.stringify(cppProperties, null, 2))
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write vscode configuration files:",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateWifiMainC(
  projectRoot: string,
  prjBase: ZephyrProjectBase,
  te: TextEncoder = new TextEncoder()
): Promise<boolean> {
  const mainC = `/*
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <errno.h>

// Local includes
#include "http.h"
#include "json_definitions.h"
#include "ping.h"
#include "wifi.h"
#include "wifi_info.h"

LOG_MODULE_REGISTER(wifi_example);

/* HTTP server to connect to */
const char HTTP_HOSTNAME[] = "google.com";
const char HTTP_PATH[] = "/";
const char JSON_HOSTNAME[] = "jsonplaceholder.typicode.com";
const char JSON_GET_PATH[] = "/posts/1";
const char JSON_POST_PATH[] = "/posts";

int main(void)
{
	printk("Starting wifi example on %s\\n", CONFIG_BOARD_TARGET);

	wifi_connect(WIFI_SSID, WIFI_PSK);

	// Ping Google DNS 4 times
	printk("Pinging 8.8.8.8 to demonstrate connection:\\n");
    ping("8.8.8.8", 4);

	printk("Now performing http GET request to google.com...\\n");
	http_get_example(HTTP_HOSTNAME, HTTP_PATH);
	k_sleep(K_SECONDS(1));

	// Using https://jsonplaceholder.typicode.com/ to demonstrate GET and POST requests with JSON
	struct json_example_object get_post_result;
	int json_get_status = json_get_example(JSON_HOSTNAME, JSON_GET_PATH, &get_post_result);
	if (json_get_status < 0)
	{
		LOG_ERR("Error in json_get_example");
	} else {
		printk("Got JSON result:\\n");
		printk("Title: %s\\n", get_post_result.title);
		printk("Body: %s\\n", get_post_result.body);
		printk("User ID: %d\\n", get_post_result.userId);
		printk("ID: %d\\n", get_post_result.id);
	}
	k_sleep(K_SECONDS(1));

	struct json_example_object new_post_result;
	struct json_example_payload new_post = { 
		.body = "RPi",
		.title = "Pico",
		.userId = 199
	};

	json_get_status = json_post_example(JSON_HOSTNAME, JSON_POST_PATH, &new_post, &new_post_result);
	if (json_get_status < 0)
	{
		LOG_ERR("Error in json_post_example");
	} else {
		printk("Got JSON result:\\n");
		printk("Title: %s\\n", new_post_result.title);
		printk("Body: %s\\n", new_post_result.body);
		printk("User ID: %d\\n", new_post_result.userId);
		printk("ID: %d\\n", new_post_result.id);
	}
	k_sleep(K_SECONDS(1));

	return 0;
}
`;

  // write the file
  try {
    await workspace.fs.createDirectory(Uri.file(join(projectRoot, "src")));
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "main.c")),
      te.encode(mainC)
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write main.c file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateMainC(
  projectRoot: string,
  prjBase: ZephyrProjectBase,
  te: TextEncoder = new TextEncoder()
): Promise<boolean> {
  if (prjBase === ZephyrProjectBase.wifi) {
    return generateWifiMainC(projectRoot, prjBase, te);
  }

  const isBlinky = prjBase === ZephyrProjectBase.blinky;

  let mainC = `#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
`;

  if (isBlinky) {
    mainC = mainC.concat("#include <zephyr/drivers/gpio.h>\n");
  }
  mainC = mainC.concat("\n");

  mainC = mainC.concat(
    "LOG_MODULE_REGISTER(main, CONFIG_LOG_DEFAULT_LEVEL);\n\n"
  );

  if (isBlinky) {
    mainC = mainC.concat("#define LED0_NODE DT_ALIAS(led0)\n\n");
    mainC = mainC.concat(
      "static const struct gpio_dt_spec led = " +
        "GPIO_DT_SPEC_GET(LED0_NODE, gpios);\n\n"
    );
  }

  mainC = mainC.concat("int main(void) {\n");

  if (isBlinky) {
    mainC = mainC.concat('    printk("Hello World! Blinky sample\\n");\n\n');
  } else {
    mainC = mainC.concat('    printk("Hello World from Pico!\\n");\n\n');
  }

  if (isBlinky) {
    const blinkySetup = `    bool led_state = false;

    if (!gpio_is_ready_dt(&led)) {
        return 0;
    }

    if (gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE) < 0) {
        return 0;
    }

`;
    mainC = mainC.concat(blinkySetup);
  }

  // main loop
  mainC = mainC.concat("    while (1) {\n");

  if (isBlinky) {
    const blinkyLoop = `        if (gpio_pin_toggle_dt(&led) < 0) {
			      return 0;
        }

		    led_state = !led_state;
		    printk("LED state: %s\\n", led_state ? "ON" : "OFF");
    
`;
    mainC = mainC.concat(blinkyLoop);
  } else {
    mainC = mainC.concat(
      '        printk("Running on %s...\\n", CONFIG_BOARD);\n\n'
    );
  }

  mainC = mainC.concat("        k_sleep(K_MSEC(1000));\n}\n\n");
  mainC = mainC.concat("    return 0;\n}\n");

  // write the file
  try {
    await workspace.fs.createDirectory(Uri.file(join(projectRoot, "src")));
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "main.c")),
      te.encode(mainC)
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write main.c file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateAdditionalCodeFiles(
  projectRoot: string,
  prjBase: ZephyrProjectBase,
  te: TextEncoder = new TextEncoder()
): Promise<boolean> {
  if (prjBase !== ZephyrProjectBase.wifi) {
    return true;
  }

  const wifiInfoTemplate = `// Fill in your WiFi information here
#define WIFI_SSID ""
#define WIFI_PSK ""
`;

  try {
    await workspace.fs.createDirectory(Uri.file(join(projectRoot, "src")));
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "http.c")),
      te.encode(WIFI_HTTP_C)
    );
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "http.h")),
      te.encode(WIFI_HTTP_H)
    );

    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "json_definitions.h")),
      te.encode(WIFI_JSON_DEFINITIONS_H)
    );

    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "ping.c")),
      te.encode(WIFI_PING_C)
    );
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "ping.h")),
      te.encode(WIFI_PING_H)
    );

    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "wifi.c")),
      te.encode(WIFI_WIFI_C)
    );
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "wifi.h")),
      te.encode(WIFI_WIFI_H)
    );

    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "src", "wifi_info.h")),
      te.encode(wifiInfoTemplate)
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write additional code files",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateGitIgnore(
  projectRoot: string,
  te: TextEncoder = new TextEncoder(),
  projBase: ZephyrProjectBase
): Promise<boolean> {
  let gitIgnore = `# Created by https://www.toptal.com/developers/gitignore/api/c,cmake,visualstudiocode,ninja,windows,macos,linux
# Edit at https://www.toptal.com/developers/gitignore?templates=c,cmake,visualstudiocode,ninja,windows,macos,linux

### C ###
# Prerequisites
*.d

# Object files
*.o
*.ko
*.obj
*.elf

# Linker output
*.ilk
*.map
*.exp

# Precompiled Headers
*.gch
*.pch

# Libraries
*.lib
*.a
*.la
*.lo

# Shared objects (inc. Windows DLLs)
*.dll
*.so
*.so.*
*.dylib

# Executables
*.exe
*.out
*.app
*.i*86
*.x86_64
*.hex

# Debug files
*.dSYM/
*.su
*.idb
*.pdb

# Kernel Module Compile Results
*.mod*
*.cmd
.tmp_versions/
modules.order
Module.symvers
Mkfile.old
dkms.conf

### CMake ###
CMakeLists.txt.user
CMakeCache.txt
CMakeFiles
CMakeScripts
Testing
Makefile
cmake_install.cmake
install_manifest.txt
compile_commands.json
CTestTestfile.cmake
_deps

### CMake Patch ###
CMakeUserPresets.json

# External projects
*-prefix/

### Linux ###
*~

# temporary files which can be created if a process still has a handle open of a deleted file
.fuse_hidden*

# KDE directory preferences
.directory

# Linux trash folder which might appear on any partition or disk
.Trash-*

# .nfs files are created when an open file is removed but is still being accessed
.nfs*

### macOS ###
# General
.DS_Store
.AppleDouble
.LSOverride

# Icon must end with two \r
Icon


# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk

### macOS Patch ###
# iCloud generated files
*.icloud

### Ninja ###
.ninja_deps
.ninja_log

### VisualStudioCode ###
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# Local History for Visual Studio Code
.history/

# Built Visual Studio Code Extensions
*.vsix

### VisualStudioCode Patch ###
# Ignore all local history of files
.history
.ionide

### Windows ###
# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump file
*.stackdump

# Folder config file
[Dd]esktop.ini

# Recycle Bin used on file shares
$RECYCLE.BIN/

# Windows Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk

# End of https://www.toptal.com/developers/gitignore/api/c,cmake,visualstudiocode,ninja,windows,macos,linux
`;

  if (projBase === ZephyrProjectBase.wifi) {
    gitIgnore = gitIgnore.concat("\r\n", "wifi_info.h\r\n");
  }

  try {
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, ".gitignore")),
      te.encode(gitIgnore)
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write .gitignore file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateCMakeList(
  projectRoot: string,
  te: TextEncoder = new TextEncoder(),
  data: ZephyrSubmitMessageValue
): Promise<boolean> {
  // TODO: maybe dynamic check cmake minimum cmake version on cmake selection
  // TODO: license notice required anymore?
  let cmakeList = `#pico-zephyr-project
#-------------------------------------------------------------------------------
# Zephyr Example Application
#
# Copyright (c) 2021 Nordic Semiconductor ASA
# SPDX-License-Identifier: Apache-2.0
#-------------------------------------------------------------------------------
# NOTE: Please do not remove the #pico-zephyr-project header, it is used by
# the Raspberry Pi Pico VS Code extension to identify the project type.
#-------------------------------------------------------------------------------

cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(${data.projectName} LANGUAGES C)
`;

  const appSources = ["src/main.c"];

  if (data.projectBase === ZephyrProjectBase.wifi) {
    appSources.push("src/http.c");
    appSources.push("src/ping.c");
    appSources.push("src/wifi.c");
  }

  cmakeList = cmakeList.concat(
    `\ntarget_sources(app PRIVATE ${appSources.join(" ")})\n`
  );

  try {
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "CMakeLists.txt")),
      te.encode(cmakeList)
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write CMakeLists.txt file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateConf(
  projectRoot: string,
  prjBase: ZephyrProjectBase,
  te: TextEncoder = new TextEncoder(),
  data: ZephyrSubmitMessageValue
): Promise<boolean> {
  // Auto-enable feature bundles
  if (prjBase === ZephyrProjectBase.blinky) {
    data.gpioFeature = true;
  }
  if (prjBase === ZephyrProjectBase.wifi) {
    data.wifiFeature = true;
  }

  // Wifi bundle implies these QoL features
  if (data.wifiFeature) {
    data.posixFeature = true;
    data.jsonFeature = true;
    data.debugFeature = true;
  }

  // Helpers
  // Keep comments and blank lines; dedupe only CONFIG lines.
  const dedupeKconfig = (lines: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const raw of lines) {
      const line = raw.replace(/\r/g, ""); // normalize CRLF → LF for processing
      const trimmed = line.trim();

      // Preserve blank lines
      if (!trimmed) {
        out.push("");
        continue;
      }

      // Preserve comments (headers, separators, notes)
      if (trimmed.startsWith("#")) {
        out.push(line);
        continue;
      }

      // Deduplicate only real Kconfig directives
      const key = trimmed; // could also normalize spaces if you like
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      out.push(line);
    }

    return out;
  };

  const section = (title: string, content: string | string[]): string => {
    const lines = Array.isArray(content) ? content : content.split("\n");
    const body = dedupeKconfig(lines);

    return body.length ? [`# ${title}`, ...body, ""].join("\r\n") : "";
  };

  const blocks: string[] = [];

  // Global logging defaults (once)
  blocks.push(
    section("Logging (global defaults)", [
      "CONFIG_LOG=y",
      "CONFIG_LOG_PRINTK=y",
      "CONFIG_LOG_DEFAULT_LEVEL=3",
    ])
  );

  // Core modules
  const moduleLines: string[] = [];
  if (data.gpioFeature) {
    moduleLines.push("CONFIG_GPIO=y");
  }
  if (data.i2cFeature) {
    moduleLines.push("CONFIG_I2C=y");
  }
  if (data.spiFeature) {
    moduleLines.push("CONFIG_SPI=y");
  }
  if (data.sensorFeature) {
    moduleLines.push("CONFIG_SENSOR=y");
  }
  if (data.posixFeature) {
    moduleLines.push("CONFIG_POSIX_API=y");
  }
  if (data.jsonFeature) {
    moduleLines.push("CONFIG_JSON_LIBRARY=y");
  }
  if (data.debugFeature) {
    moduleLines.push("CONFIG_DEBUG=y");
  }

  if (moduleLines.length) {
    blocks.push(section("Enabled modules", moduleLines.join("\n")));
  }

  // Put the Wi-Fi/Networking block as its own section
  if (data.wifiFeature) {
    blocks.push(section("Networking & Wi-Fi", WIFI_PRJ_CONF));
  }

  // Shells (only if requested)
  if (data.shellFeature) {
    const shellLines: string[] = ["CONFIG_SHELL=y"];
    if (data.gpioFeature) {
      shellLines.push("CONFIG_GPIO_SHELL=y");
    }
    if (data.i2cFeature) {
      shellLines.push("CONFIG_I2C_SHELL=y");
    }
    if (data.spiFeature) {
      shellLines.push("CONFIG_SPI_SHELL=y");
    }
    if (data.sensorFeature) {
      shellLines.push("CONFIG_SENSOR_SHELL=y");
    }
    if (data.wifiFeature) {
      shellLines.push(shellWifiKconfig);
    }
    blocks.push(section("Shells", shellLines.join("\n")));
  }

  const confLf = blocks
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"); // collapse >2 blanks to 1

  try {
    await workspace.fs.writeFile(
      Uri.file(join(projectRoot, "prj.conf")),
      te.encode(confLf.endsWith("\n") ? confLf : confLf + "\n")
    );

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write prj.conf file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function addSnippets(
  projectRoot: string,
  te: TextEncoder = new TextEncoder(),
  data: ZephyrSubmitMessageValue
): Promise<boolean> {
  // check for all snippet options if we should even continue
  if (data.console !== "USB") {
    return true;
  }

  const usbSerialSnippetYml = `name: usb_serial_port
append:
  EXTRA_CONF_FILE: usb_serial_port.conf
  EXTRA_DTC_OVERLAY_FILE: usb_serial_port.overlay
`;

  const usbSerialPortConf = `CONFIG_USB_DEVICE_STACK=y
CONFIG_USB_DEVICE_PRODUCT="Raspberry Pi Pico Example for Zephyr"
CONFIG_USB_DEVICE_VID=0x2E8A
CONFIG_USB_DEVICE_PID=0x0001

CONFIG_USB_DEVICE_INITIALIZE_AT_BOOT=y

CONFIG_SERIAL=y
CONFIG_UART_LINE_CTRL=y

CONFIG_USB_DRIVER_LOG_LEVEL_ERR=y
CONFIG_USB_DEVICE_LOG_LEVEL_ERR=y
CONFIG_USB_CDC_ACM_LOG_LEVEL_ERR=y
`;

  const usbSerialPortOverlay = `/ {
	chosen {
		zephyr,console = &usb_serial_port;
		zephyr,shell-uart = &usb_serial_port;
	};
};

&zephyr_udc0 {
	usb_serial_port: usb_serial_port {
		compatible = "zephyr,cdc-acm-uart";
	};
};
`;

  try {
    await workspace.fs.createDirectory(Uri.file(join(projectRoot, "snippets")));

    if (data.console === "USB") {
      const usbSerialFolder = join(projectRoot, "snippets", "usb_serial_port");
      await workspace.fs.createDirectory(Uri.file(usbSerialFolder));

      await workspace.fs.writeFile(
        Uri.file(join(usbSerialFolder, "snippet.yml")),
        te.encode(usbSerialSnippetYml)
      );
      await workspace.fs.writeFile(
        Uri.file(join(usbSerialFolder, "usb_serial_port.conf")),
        te.encode(usbSerialPortConf)
      );
      await workspace.fs.writeFile(
        Uri.file(join(usbSerialFolder, "usb_serial_port.overlay")),
        te.encode(usbSerialPortOverlay)
      );
    }

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectZephyr,
      "Failed to write code snippets:",
      unknownErrorToString(error)
    );

    return false;
  }
}

/**
 * Generates a new Zephyr project in the given folder.
 *
 * @param projectFolder The path where the project folder should be created.
 * @param projectName The name of the project folder to create.
 * @param prjBase The base template to use for the project.
 * @returns True if the project was created successfully, false otherwise.
 */
export async function generateZephyrProject(
  projectFolder: string,
  projectName: string,
  latestVb: [string, VersionBundle],
  ninjaPath: string,
  cmakePath: string,
  data: ZephyrSubmitMessageValue
): Promise<boolean> {
  const projectRoot = join(projectFolder, projectName);

  try {
    await workspace.fs.createDirectory(Uri.file(projectRoot));
  } catch (error) {
    const msg = unknownErrorToString(error);
    if (
      msg.includes("EPERM") ||
      msg.includes("EACCES") ||
      msg.includes("access denied")
    ) {
      Logger.error(
        LoggerSource.projectRust,
        "Failed to create project folder",
        "Permission denied. Please check your permissions."
      );

      void window.showErrorMessage(
        "Failed to create project folder. " +
          "Permission denied - Please check your permissions."
      );
    } else {
      Logger.error(
        LoggerSource.projectRust,
        "Failed to create project folder",
        unknownErrorToString(error)
      );

      void window.showErrorMessage(
        "Failed to create project folder. " +
          "See the output panel for more details."
      );
    }

    return false;
  }

  const te = new TextEncoder();

  let result = await generateGitIgnore(projectRoot, te, data.projectBase);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate .gitignore file"
    );

    return false;
  }

  result = await generateMainC(projectRoot, data.projectBase, te);
  if (!result) {
    Logger.debug(LoggerSource.projectRust, "Failed to generate main.c file");

    return false;
  }

  result = await generateAdditionalCodeFiles(projectRoot, data.projectBase, te);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate additional code files"
    );

    return false;
  }

  result = await generateVSCodeConfig(
    projectRoot,
    latestVb,
    ninjaPath,
    cmakePath,
    te,
    data
  );
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate .vscode configuration files."
    );

    return false;
  }

  result = await generateCMakeList(projectRoot, te, data);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate CMakeLists.txt file"
    );

    return false;
  }

  result = await generateConf(projectRoot, data.projectBase, te, data);
  if (!result) {
    Logger.debug(LoggerSource.projectRust, "Failed to generate prj.conf file");

    return false;
  }

  result = await addSnippets(projectRoot, te, data);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate code snippets file"
    );

    return false;
  }

  return true;
}
