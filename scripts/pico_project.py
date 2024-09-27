#!/usr/bin/env python3

#
# Copyright (c) 2020-2024 Raspberry Pi (Trading) Ltd.
#
# SPDX-License-Identifier: BSD-3-Clause
#

#
# Copyright (c) 2023-2024 paulober <github.com/paulober>
#
# SPDX-License-Identifier: MPL-2.0
#

import argparse
import os
import shutil
from pathlib import Path
import sys
import re
import platform
import csv

CMAKELIST_FILENAME = 'CMakeLists.txt'
CMAKECACHE_FILENAME = 'CMakeCache.txt'

ARM_TRIPLE = 'arm-none-eabi'
RISCV_TRIPLE = 'riscv32-unknown-elf'
COREV_TRIPLE = 'riscv32-corev-elf'
COMPILER_TRIPLE = ARM_TRIPLE
def COMPILER_NAME():
    return f"{COMPILER_TRIPLE}-gcc"
def GDB_NAME():
    return f"{COMPILER_TRIPLE}-gdb"
CMAKE_TOOLCHAIN_NAME = "pico_arm_gcc.cmake"

VSCODE_LAUNCH_FILENAME = 'launch.json'
VSCODE_C_PROPERTIES_FILENAME = 'c_cpp_properties.json'
VSCODE_CMAKE_KITS_FILENAME ='cmake-kits.json'
VSCODE_SETTINGS_FILENAME ='settings.json'
VSCODE_EXTENSIONS_FILENAME ='extensions.json'
VSCODE_TASKS_FILENAME ='tasks.json'
VSCODE_FOLDER='.vscode'

CONFIG_UNSET="Not set"

# Standard libraries for all builds
# And any more to string below, space separator
STANDARD_LIBRARIES = 'pico_stdlib'

# Indexed on feature name, tuple contains the C file, the H file and the CMake project name for the feature. 
# Some lists may contain an extra/ancillary file needed for that feature
GUI_TEXT = 0
C_FILE = 1
H_FILE = 2
LIB_NAME = 3
ANCILLARY_FILE = 4

features_list = {
    'spi' :             ("SPI",             "spi.c",            "hardware/spi.h",       "hardware_spi",         ""),
    'i2c' :             ("I2C interface",   "i2c.c",            "hardware/i2c.h",       "hardware_i2c",         ""),
    'dma' :             ("DMA support",     "dma.c",            "hardware/dma.h",       "hardware_dma",         ""),
    'pio' :             ("PIO interface",   "pio.c",            "hardware/pio.h",       "hardware_pio",         "blink.pio"),
    'interp' :          ("HW interpolation", "interp.c",        "hardware/interp.h",    "hardware_interp",      ""),
    'timer' :           ("HW timer",        "timer.c",          "hardware/timer.h",     "hardware_timer",       ""),
    'watchdog' :        ("HW watchdog",     "watch.c",          "hardware/watchdog.h",  "hardware_watchdog",    ""),
    'clocks' :          ("HW clocks",       "clocks.c",         "hardware/clocks.h",    "hardware_clocks",      ""),
}

picow_options_list = {
    'picow_none' :      ("None", "",                            "",    "",                                                                  ""),
    'picow_led' :       ("PicoW onboard LED", "",               "pico/cyw43_arch.h",    "pico_cyw43_arch_none",                             ""),
    'picow_poll' :      ("Polled lwIP",     "",                 "pico/cyw43_arch.h",    "pico_cyw43_arch_lwip_poll",                        "lwipopts.h"),
    'picow_background' :("Background lwIP", "",                 "pico/cyw43_arch.h",    "pico_cyw43_arch_lwip_threadsafe_background",       "lwipopts.h"),
#    'picow_freertos' :  ("Full lwIP (FreeRTOS)", "",            "pico/cyw43_arch.h",    "pico_cyw43_arch_lwip_sys_freertos",                "lwipopts.h"),
}

stdlib_examples_list = {
    'uart':     ("UART",                    "uart.c",           "hardware/uart.h",      "hardware_uart"),
    'gpio' :    ("GPIO interface",          "gpio.c",           "hardware/gpio.h",      "hardware_gpio"),
    'div' :     ("Low level HW Divider",    "divider.c",        "hardware/divider.h",   "hardware_divider")
}

debugger_list = ["DebugProbe (CMSIS-DAP)", "SWD (Pi host)"]
debugger_config_list = ["interface/cmsis-dap.cfg", "raspberrypi-swd.cfg"]

DEFINES = 0
INITIALISERS = 1
# Could add an extra item that shows how to use some of the available functions for the feature
#EXAMPLE = 2

# This also contains example code for the standard library (see stdlib_examples_list)
code_fragments_per_feature = {
    'uart' : [
              (
                "// UART defines",
                "// By default the stdout UART is `uart0`, so we will use the second one",
                "#define UART_ID uart1",
                "#define BAUD_RATE 115200", "",
                "// Use pins 4 and 5 for UART1",
                "// Pins can be changed, see the GPIO function select table in the datasheet for information on GPIO assignments",
                "#define UART_TX_PIN 4",
                "#define UART_RX_PIN 5"
              ),
              (
                "// Set up our UART",
                "uart_init(UART_ID, BAUD_RATE);",
                "// Set the TX and RX pins by using the function select on the GPIO",
                "// Set datasheet for more information on function select",
                "gpio_set_function(UART_TX_PIN, GPIO_FUNC_UART);",
                "gpio_set_function(UART_RX_PIN, GPIO_FUNC_UART);",
                "",
                "// Use some the various UART functions to send out data",
                "// In a default system, printf will also output via the default UART",
                "",
                # here should be following
                # "// Send out a character without any conversions",
                #"uart_putc_raw(UART_ID, 'A');",
                #"",
                #"// Send out a character but do CR/LF conversions",
                #"uart_putc(UART_ID, 'B');",
                # "",
                "// Send out a string, with CR/LF conversions",
                "uart_puts(UART_ID, \" Hello, UART!\\n\");",
                "",
                "// For more examples of UART use see https://github.com/raspberrypi/pico-examples/tree/master/uart"
              )
            ],
    'spi' : [
              (
                "// SPI Defines",
                "// We are going to use SPI 0, and allocate it to the following GPIO pins",
                "// Pins can be changed, see the GPIO function select table in the datasheet for information on GPIO assignments",
                "#define SPI_PORT spi0",
                "#define PIN_MISO 16",
                "#define PIN_CS   17",
                "#define PIN_SCK  18",
                "#define PIN_MOSI 19"
              ),
              (
                "// SPI initialisation. This example will use SPI at 1MHz.",
                "spi_init(SPI_PORT, 1000*1000);",
                "gpio_set_function(PIN_MISO, GPIO_FUNC_SPI);",
                "gpio_set_function(PIN_CS,   GPIO_FUNC_SIO);",
                "gpio_set_function(PIN_SCK,  GPIO_FUNC_SPI);",
                "gpio_set_function(PIN_MOSI, GPIO_FUNC_SPI);", "",
                "// Chip select is active-low, so we'll initialise it to a driven-high state",
                "gpio_set_dir(PIN_CS, GPIO_OUT);",
                "gpio_put(PIN_CS, 1);",
                "// For more examples of SPI use see https://github.com/raspberrypi/pico-examples/tree/master/spi"
              )
            ],
    'i2c' : [
              (
                "// I2C defines",
                "// This example will use I2C0 on GPIO8 (SDA) and GPIO9 (SCL) running at 400KHz.",
                "// Pins can be changed, see the GPIO function select table in the datasheet for information on GPIO assignments",
                "#define I2C_PORT i2c0",
                "#define I2C_SDA 8",
                "#define I2C_SCL 9",
              ),
              (
                "// I2C Initialisation. Using it at 400Khz.",
                "i2c_init(I2C_PORT, 400*1000);","",
                "gpio_set_function(I2C_SDA, GPIO_FUNC_I2C);",
                "gpio_set_function(I2C_SCL, GPIO_FUNC_I2C);",
                "gpio_pull_up(I2C_SDA);",
                "gpio_pull_up(I2C_SCL);",
                "// For more examples of I2C use see https://github.com/raspberrypi/pico-examples/tree/master/i2c",
              )
            ],
    "dma" : [
              (
                '// Data will be copied from src to dst',
                'const char src[] = "Hello, world! (from DMA)";',
                'char dst[count_of(src)];',
              ),
              (
                '// Get a free channel, panic() if there are none',
                'int chan = dma_claim_unused_channel(true);',
                '',
                '// 8 bit transfers. Both read and write address increment after each',
                '// transfer (each pointing to a location in src or dst respectively).',
                '// No DREQ is selected, so the DMA transfers as fast as it can.',
                '',
                'dma_channel_config c = dma_channel_get_default_config(chan);',
                'channel_config_set_transfer_data_size(&c, DMA_SIZE_8);',
                'channel_config_set_read_increment(&c, true);',
                'channel_config_set_write_increment(&c, true);',
                '',
                'dma_channel_configure(',
                '    chan,          // Channel to be configured',
                '    &c,            // The configuration we just created',
                '    dst,           // The initial write address',
                '    src,           // The initial read address',
                '    count_of(src), // Number of transfers; in this case each is 1 byte.',
                '    true           // Start immediately.',
                ');',
                '',
                '// We could choose to go and do something else whilst the DMA is doing its',
                '// thing. In this case the processor has nothing else to do, so we just',
                '// wait for the DMA to finish.',
                'dma_channel_wait_for_finish_blocking(chan);',
                '',
                '// The DMA has now copied our text from the transmit buffer (src) to the',
                '// receive buffer (dst), so we can print it out from there.',
                'puts(dst);',
              )
            ],

    "pio" : [
              (
                '#include "blink.pio.h"','',
                'void blink_pin_forever(PIO pio, uint sm, uint offset, uint pin, uint freq) {',
                '    blink_program_init(pio, sm, offset, pin);',
                '    pio_sm_set_enabled(pio, sm, true);',
                '',
                '    printf("Blinking pin %d at %d Hz\\n", pin, freq);',
                '',
                '    // PIO counter program takes 3 more cycles in total than we pass as',
                '    // input (wait for n + 1; mov; jmp)',
                '    pio->txf[sm] = (125000000 / (2 * freq)) - 3;',
                '}',
              ),
              (
                '// PIO Blinking example',
                'PIO pio = pio0;',
                'uint offset = pio_add_program(pio, &blink_program);',
                'printf("Loaded program at %d\\n", offset);',
                '',
                '#ifdef PICO_DEFAULT_LED_PIN',
                'blink_pin_forever(pio, 0, offset, PICO_DEFAULT_LED_PIN, 3);',
                '#else',
                'blink_pin_forever(pio, 0, offset, 6, 3);',
                '#endif',
                '// For more pio examples see https://github.com/raspberrypi/pico-examples/tree/master/pio',
              )
            ],

    "clocks" :  [
                  (),
                  (
                    'printf("System Clock Frequency is %d Hz\\n", clock_get_hz(clk_sys));',
                    'printf("USB Clock Frequency is %d Hz\\n", clock_get_hz(clk_usb));',
                    '// For more examples of clocks use see https://github.com/raspberrypi/pico-examples/tree/master/clocks',
                  )
                ],

    "gpio" : [
              (
                "// GPIO defines",
                "// Example uses GPIO 2",
                "#define GPIO 2"
              ),
              (
                "// GPIO initialisation.",
                "// We will make this GPIO an input, and pull it up by default",
                "gpio_init(GPIO);",
                "gpio_set_dir(GPIO, GPIO_IN);",
                "gpio_pull_up(GPIO);",
                "// See https://github.com/raspberrypi/pico-examples/tree/master/gpio for other gpio examples, including using interrupts",
              )
            ],
    "interp" :[
               (),
               (
                "// Interpolator example code",
                "interp_config cfg = interp_default_config();",
                "// Now use the various interpolator library functions for your use case",
                "// e.g. interp_config_clamp(&cfg, true);",
                "//      interp_config_shift(&cfg, 2);",
                "// Then set the config ",
                "interp_set_config(interp0, 0, &cfg);",
                "// For examples of interpolator use see https://github.com/raspberrypi/pico-examples/tree/master/interp"
               )
              ],

    "timer"  : [
                (
                 "int64_t alarm_callback(alarm_id_t id, void *user_data) {",
                 "    // Put your timeout handler code in here",
                 "    return 0;",
                 "}"
                ),
                (
                 "// Timer example code - This example fires off the callback after 2000ms",
                 "add_alarm_in_ms(2000, alarm_callback, NULL, false);",
                 "// For more examples of timer use see https://github.com/raspberrypi/pico-examples/tree/master/timer"
                )
              ],

    "watchdog":[ (),
                (
                    "// Watchdog example code",
                    "if (watchdog_caused_reboot()) {",
                    "    printf(\"Rebooted by Watchdog!\\n\");",
                    "    // Whatever action you may take if a watchdog caused a reboot",
                    "}","",
                    "// Enable the watchdog, requiring the watchdog to be updated every 100ms or the chip will reboot",
                    "// second arg is pause on debug which means the watchdog will pause when stepping through code",
                    "watchdog_enable(100, 1);","",
                    "// You need to call this function at least more often than the 100ms in the enable call to prevent a reboot",
                    "watchdog_update();",
                )
              ],

    "div"    : [ (),
                 (
                    "// Example of using the HW divider. The pico_divider library provides a more user friendly set of APIs ",
                    "// over the divider (and support for 64 bit divides), and of course by default regular C language integer",
                    "// divisions are redirected thru that library, meaning you can just use C level `/` and `%` operators and",
                    "// gain the benefits of the fast hardware divider.",
                    "int32_t dividend = 123456;",
                    "int32_t divisor = -321;",
                    "// This is the recommended signed fast divider for general use.",
                    "divmod_result_t result = hw_divider_divmod_s32(dividend, divisor);",
                    "printf(\"%d/%d = %d remainder %d\\n\", dividend, divisor, to_quotient_s32(result), to_remainder_s32(result));",
                    "// This is the recommended unsigned fast divider for general use.",
                    "int32_t udividend = 123456;",
                    "int32_t udivisor = 321;",
                    "divmod_result_t uresult = hw_divider_divmod_u32(udividend, udivisor);",
                    "printf(\"%d/%d = %d remainder %d\\n\", udividend, udivisor, to_quotient_u32(uresult), to_remainder_u32(uresult));",
                    "// See https://github.com/raspberrypi/pico-examples/tree/master/divider for more complex use"
                 )
                ],

    "picow_led":[ (),
                  (
                    "// Example to turn on the Pico W LED",
                    "cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 1);"
                  )
                ],

    "picow_wifi":[ (),
                  (
                    '// Enable wifi station',
                    'cyw43_arch_enable_sta_mode();\n',
                    'printf("Connecting to Wi-Fi...\\n");',
                    'if (cyw43_arch_wifi_connect_timeout_ms("Your Wi-Fi SSID", "Your Wi-Fi Password", CYW43_AUTH_WPA2_AES_PSK, 30000)) {',
                    '    printf("failed to connect.\\n");',
                    '    return 1;',
                    '} else {',
                    '    printf("Connected.\\n");',
                    '    // Read the ip address in a human readable way',
                    '    uint8_t *ip_address = (uint8_t*)&(cyw43_state.netif[0].ip_addr.addr);',
                    '    printf("IP address %d.%d.%d.%d\\n", ip_address[0], ip_address[1], ip_address[2], ip_address[3]);',
                    '}',
                  )
                ]
}

# Add wifi example for poll and background modes
code_fragments_per_feature["picow_poll"] = code_fragments_per_feature["picow_wifi"]
code_fragments_per_feature["picow_background"] = code_fragments_per_feature["picow_wifi"]

configuration_dictionary = list(dict())

isMac = False
isWindows = False
isx86 = False
compilerPath = Path(f"/usr/bin/{COMPILER_NAME()}")

def relativeSDKPath(sdkVersion):
    return f"/.pico-sdk/sdk/{sdkVersion}"

def relativeToolchainPath(toolchainVersion):
    return f"/.pico-sdk/toolchain/{toolchainVersion}"

def relativeToolsPath(sdkVersion):
    return f"/.pico-sdk/tools/{sdkVersion}"

def relativePicotoolPath(picotoolVersion):
    return f"/.pico-sdk/picotool/{picotoolVersion}"

def relativeOpenOCDPath(openocdVersion):
    return f"/.pico-sdk/openocd/{openocdVersion}"

def cmakeIncPath():
    return "${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake"

def propertiesSdkPath(sdkVersion, force_windows=False, force_non_windows=False):
    if (isWindows or force_windows) and not force_non_windows:
        return f"${{env:USERPROFILE}}{relativeSDKPath(sdkVersion)}"
    else:
        return f"${{env:HOME}}{relativeSDKPath(sdkVersion)}"
    
def propertiesPicotoolPath(picotoolVersion, force_windows=False, force_non_windows=False):
    if (isWindows or force_windows) and not force_non_windows:
        return f"${{env:USERPROFILE}}{relativePicotoolPath(picotoolVersion)}"
    else:
        return f"${{env:HOME}}{relativePicotoolPath(picotoolVersion)}"

def codeSdkPath(sdkVersion):
    return f"${{userHome}}{relativeSDKPath(sdkVersion)}"

def codeOpenOCDPath(openocdVersion):
    return f"${{userHome}}{relativeOpenOCDPath(openocdVersion)}"

def propertiesToolchainPath(toolchainVersion, force_windows=False, force_non_windows=False):
    if (isWindows or force_windows) and not force_non_windows:
        return f"${{env:USERPROFILE}}{relativeToolchainPath(toolchainVersion)}"
    else:
        return f"${{env:HOME}}{relativeToolchainPath(toolchainVersion)}"

def codeToolchainPath(toolchainVersion):
    return f"${{userHome}}{relativeToolchainPath(toolchainVersion)}"

def semver_compare_ge(first, second):
    """ Compare two semantic version strings and return True if the first is greater or equal to the second """
    first_tuple = tuple(map(int, first.split(".")))
    second_tuple = tuple(map(int, second.split(".")))
    
    assert len(first_tuple) == 3
    assert len(second_tuple) == 3

    return first_tuple >= second_tuple

def CheckPrerequisites():
    global isMac, isWindows, isx86
    isMac = (platform.system() == 'Darwin')
    isWindows = (platform.system() == 'Windows')
    isx86 = (platform.machine().lower() in ['x86_64', 'amd64'])

    # Do we have a compiler?
    return shutil.which(COMPILER_NAME(), 1, os.environ["Path" if isWindows else "PATH"])


def CheckSDKPath(gui):
    sdkPath = os.getenv('PICO_SDK_PATH')

    if sdkPath == None:
        m = 'Unable to locate the Raspberry Pi Pico SDK, PICO_SDK_PATH is not set'
        print(m)
    elif not os.path.isdir(sdkPath):
        m = 'Unable to locate the Raspberry Pi Pico SDK, PICO_SDK_PATH does not point to a directory'
        print(m)
        sdkPath = None

    return sdkPath

def GetFilePath(filename):
    if os.path.islink(__file__):
        script_file = os.readlink(__file__)
    else:
        script_file = __file__
    return os.path.join(os.path.dirname(script_file), filename)

def ParseCommandLine():
    debugger_flags = ', '.join('{} = {}'.format(i, v) for i, v in enumerate(debugger_list))
    parser = argparse.ArgumentParser(description='Pico Project generator')
    parser.add_argument("name", nargs="?", help="Name of the project")
    parser.add_argument("-t", "--tsv", help="Select an alternative pico_configs.tsv file", default=GetFilePath("pico_configs.tsv"))
    parser.add_argument("-o", "--output", help="Set an alternative CMakeList.txt filename", default="CMakeLists.txt")
    parser.add_argument("-x", "--examples", action='store_true', help="Add example code for the Pico standard library")
    parser.add_argument("-ux", "--uartExample", action='store_true', help="Add example code for UART support with the Pico SDK")
    parser.add_argument("-l", "--list", action='store_true', help="List available features")
    parser.add_argument("-c", "--configs", action='store_true', help="List available project configuration items")
    parser.add_argument("-f", "--feature", action='append', help="Add feature to generated project")
    parser.add_argument("-over", "--overwrite", action='store_true', help="Overwrite any existing project AND files")
    parser.add_argument("-conv", "--convert", action='store_true', help="Convert any existing project - risks data loss")
    parser.add_argument("-exam", "--example", action='store_true', help="Convert an examples folder to standalone project")
    parser.add_argument("-b", "--build", action='store_true', help="Build after project created")
    parser.add_argument("-g", "--gui", action='store_true', help="Run a GUI version of the project generator")
    parser.add_argument("-p", "--project", action='append', help="Generate projects files for IDE. Options are: vscode")
    parser.add_argument("-r", "--runFromRAM", action='store_true', help="Run the program from RAM rather than flash")
    parser.add_argument("-e", "--entryProjName", action='store_true', help="Use project name as entry point file name")
    parser.add_argument("-uart", "--uart", action='store_true', default=1, help="Console output to UART (default)")
    parser.add_argument("-nouart", "--nouart", action='store_true', default=0, help="Disable console output to UART")
    parser.add_argument("-usb", "--usb", action='store_true', help="Console output to USB (disables other USB functionality")
    parser.add_argument("-cpp", "--cpp", action='store_true', default=0, help="Generate C++ code")
    parser.add_argument("-cpprtti", "--cpprtti", action='store_true', default=0, help="Enable C++ RTTI (Uses more memory)")
    parser.add_argument("-cppex", "--cppexceptions", action='store_true', default=0, help="Enable C++ exceptions (Uses more memory)")
    parser.add_argument("-d", "--debugger", type=int, help="Select debugger ({})".format(debugger_flags), default=0)
    parser.add_argument("-board", "--boardtype", action="store", default='pico', help="Select board type (see --boardlist for available boards)")
    parser.add_argument("-bl", "--boardlist", action="store_true", help="List available board types")
    parser.add_argument("-cp", "--cpath", help="Override default VSCode compiler path")
    parser.add_argument("-root", "--projectRoot", help="Override default project root where the new project will be created")
    parser.add_argument("-sdkVersion", "--sdkVersion", help="Pico SDK version to use (required)")
    parser.add_argument("-tcVersion", "--toolchainVersion", help="ARM/RISCV Embeded Toolchain version to use (required)")
    parser.add_argument("-picotoolVersion", "--picotoolVersion", help="Picotool version to use (required)")
    parser.add_argument("-np", "--ninjaPath", help="Ninja path")
    parser.add_argument("-cmp", "--cmakePath", help="CMake path")
    parser.add_argument("-openOCDVersion", "--openOCDVersion", help="OpenOCD version to use - defaults to 0", default=0)
    parser.add_argument("-examLibs", "--exampleLibs", action='append', help="Include an examples library in the folder")
    parser.add_argument("-ucmt", "--useCmakeTools", action='store_true', help="Enable CMake Tools extension integration")

    return parser.parse_args()


def GenerateMain(folder, projectName, features, cpp, wantEntryProjName):

    executableName = projectName if wantEntryProjName else "main"
    if cpp:
        filename = Path(folder) / (executableName + '.cpp')
    else:
        filename = Path(folder) / (executableName + '.c')

    file = open(filename, 'w')

    main = ('#include <stdio.h>\n'
            '#include "pico/stdlib.h"\n'
            )
    file.write(main)

    if (features):

        # Add any includes
        for feat in features:
            if (feat in features_list):
                if len(features_list[feat][H_FILE]) == 0:
                    continue
                o = f'#include "{features_list[feat][H_FILE]}"\n'
                file.write(o)
            if (feat in stdlib_examples_list):
                if len(stdlib_examples_list[feat][H_FILE]) == 0:
                    continue
                o = f'#include "{stdlib_examples_list[feat][H_FILE]}"\n'
                file.write(o)
            if (feat in picow_options_list):
                if len(picow_options_list[feat][H_FILE]) == 0:
                    continue
                o = f'#include "{picow_options_list[feat][H_FILE]}"\n'
                file.write(o)

        file.write('\n')

        # Add any defines
        for feat in features:
            if (feat in code_fragments_per_feature):
                for s in code_fragments_per_feature[feat][DEFINES]:
                    file.write(s)
                    file.write('\n')
                file.write('\n')

    main = ('\n\n'
            'int main()\n'
            '{\n'
            '    stdio_init_all();\n\n'
            )

    if any([feat in picow_options_list and feat != "picow_none" for feat in features]):
        main += (
            '    // Initialise the Wi-Fi chip\n'
            '    if (cyw43_arch_init()) {\n'
            '        printf("Wi-Fi init failed\\n");\n'
            '        return -1;\n'
            '    }\n\n')

    if (features):
        # Add any initialisers
        indent = 4
        for feat in features:
            if (feat in code_fragments_per_feature):
                for s in code_fragments_per_feature[feat][INITIALISERS]:
                    main += (" " * indent)
                    main += s
                    main += '\n'
                main += '\n'

    main += ('    while (true) {\n'
             '        printf("Hello, world!\\n");\n'
             '        sleep_ms(1000);\n'
             '    }\n'
             '}\n'
            )

    file.write(main)

    file.close()


def GenerateCMake(folder, params):
    filename = Path(folder) / CMAKELIST_FILENAME
    projectName = params['projectName']
    board_type = params['boardtype']

    cmake_header1 = (f"# Generated Cmake Pico project file\n\n"
                 "cmake_minimum_required(VERSION 3.13)\n\n"
                 "set(CMAKE_C_STANDARD 11)\n"
                 "set(CMAKE_CXX_STANDARD 17)\n"
                 "set(CMAKE_EXPORT_COMPILE_COMMANDS ON)\n\n"
                 "# Initialise pico_sdk from installed location\n"
                 "# (note this can come from environment, CMake cache etc)\n\n"
                )

    # if you change the do never edit headline you need to change the check for it in extension.mts
    cmake_header_us = (
                "# == DO NEVER EDIT THE NEXT LINES for Raspberry Pi Pico VS Code Extension to work ==\n"
                "if(WIN32)\n"
                "    set(USERHOME $ENV{USERPROFILE})\n"
                "else()\n"
                "    set(USERHOME $ENV{HOME})\n"
                "endif()\n"
                f"set(sdkVersion {params['sdkVersion']})\n"
                f"set(toolchainVersion {params['toolchainVersion']})\n"
                f"set(picotoolVersion {params['picotoolVersion']})\n"
                f"set(picoVscode {cmakeIncPath()})\n"
                "if (EXISTS ${picoVscode})\n"
                "    include(${picoVscode})\n"
                "endif()\n"
                "# ====================================================================================\n"
                )

    cmake_header2 = (
                 f"set(PICO_BOARD {board_type} CACHE STRING \"Board type\")\n\n"
                 "# Pull in Raspberry Pi Pico SDK (must be before project)\n"
                 "include(pico_sdk_import.cmake)\n\n"
                 f"project({projectName} C CXX ASM)\n"
                )

    cmake_header3 = (
                "\n# Initialise the Raspberry Pi Pico SDK\n"
                "pico_sdk_init()\n\n"
                "# Add executable. Default name is the project name, version 0.1\n\n"
                )


    if params['wantConvert']:
        with open(filename, 'r+') as file:
            content = file.read()
            file.seek(0)
            lines = file.readlines()
            file.seek(0)
            if not params['wantExample']:
                # Prexisting CMake configuration - just adding cmake_header_us
                file.write(cmake_header_us)
                file.write(content)
            else:
                if any(["pico_cyw43_arch_lwip_threadsafe_background" in line for line in lines]):
                    print("Threadsafe Background")
                    params["wantThreadsafeBackground"] = True
                if any(["pico_cyw43_arch_lwip_poll" in line for line in lines]):
                    print("Poll")
                    params["wantPoll"] = True
                # Get project name
                for line in lines:
                    if "add_executable" in line:
                        if params["wantThreadsafeBackground"] or params["wantPoll"]:
                            newProjectName = line.split('(')[1].split()[0].strip().strip("()")
                            newProjectName = newProjectName.replace("_background", "")
                            newProjectName = newProjectName.replace("_poll", "")
                            print("New project name", newProjectName)
                            cmake_header2 = cmake_header2.replace(projectName, newProjectName)
                # Write all headers
                file.write(cmake_header1)
                file.write(cmake_header_us)
                file.write(cmake_header2)
                file.write(cmake_header3)
                for lib in params["exampleLibs"]:
                    file.write(f"add_subdirectory({lib})\n")
                file.flush()
                # Remove example_auto_set_url
                for i, line in enumerate(lines):
                    if "example_auto_set_url" in line:
                        lines[i] = ""
                        print("Removed", line, lines[i])
                    if "target_link_libraries" in line:
                        for lib in params["exampleLibs"]:
                            lines[i] += f"  {lib}\n"
                file.writelines(lines)
        return


    file = open(filename, 'w')

    file.write(cmake_header1)
    file.write(cmake_header_us)
    file.write(cmake_header2)

    if params['exceptions']:
        file.write("\nset(PICO_CXX_ENABLE_EXCEPTIONS 1)\n")

    if params['rtti']:
        file.write("\nset(PICO_CXX_ENABLE_RTTI 1)\n")

    file.write(cmake_header3)

    # add the preprocessor defines for overall configuration
    if params['configs']:
        file.write('# Add any PICO_CONFIG entries specified in the Advanced settings\n')
        for c, v in params['configs'].items():
            if v == "True":
                v = "1"
            elif v == "False":
                v = "0"
            file.write(f'add_compile_definitions({c} = {v})\n')
        file.write('\n')

    entry_point_file_name = projectName if params['wantEntryProjName'] else "main"

    if params['wantCPP']:
        file.write(f'add_executable({projectName} {entry_point_file_name}.cpp )\n\n')
    else:
        file.write(f'add_executable({projectName} {entry_point_file_name}.c )\n\n')

    file.write(f'pico_set_program_name({projectName} "{projectName}")\n')
    file.write(f'pico_set_program_version({projectName} "0.1")\n\n')

    if params['wantRunFromRAM']:
        file.write(f'# no_flash means the target is to run from RAM\n')
        file.write(f'pico_set_binary_type({projectName} no_flash)\n\n')

    # Add pio output
    if params['features'] and "pio" in params['features']:
        file.write(f'# Generate PIO header\n')
        file.write(f'pico_generate_pio_header({projectName} ${{CMAKE_CURRENT_LIST_DIR}}/blink.pio)\n\n')

    # Console output destinations
    file.write("# Modify the below lines to enable/disable output over UART/USB\n")
    if params['wantUART']:
        file.write(f'pico_enable_stdio_uart({projectName} 1)\n')
    else:
        file.write(f'pico_enable_stdio_uart({projectName} 0)\n')

    if params['wantUSB']:
        file.write(f'pico_enable_stdio_usb({projectName} 1)\n\n')
    else:
        file.write(f'pico_enable_stdio_usb({projectName} 0)\n\n')

    # If we need wireless, check for SSID and password
    # removed for the moment as these settings are currently only needed for the pico-examples
    # but may be required in here at a later date.
    if False:
        if 'ssid' in params or 'password' in params:
            file.write('# Add any wireless access point information\n')
            file.write(f'target_compile_definitions({projectName} PRIVATE\n')
            if 'ssid' in params:
                file.write(f'WIFI_SSID=\" {params["ssid"]} \"\n')
            else:
                file.write(f'WIFI_SSID=\"${WIFI_SSID}\"')

            if 'password' in params:
                file.write(f'WIFI_PASSWORD=\"{params["password"]}\"\n')
            else:
                file.write(f'WIFI_PASSWORD=\"${WIFI_PASSWORD}\"')
            file.write(')\n\n')

    # Standard libraries
    file.write('# Add the standard library to the build\n')
    file.write(f'target_link_libraries({projectName}\n')
    file.write("        " + STANDARD_LIBRARIES)
    file.write(')\n\n')

    # Standard include directories
    file.write('# Add the standard include files to the build\n')
    file.write(f'target_include_directories({projectName} PRIVATE\n')
    file.write("  ${CMAKE_CURRENT_LIST_DIR}\n")
    file.write(')\n\n')

    # Selected libraries/features
    if (params['features']):
        file.write('# Add any user requested libraries\n')
        file.write(f'target_link_libraries({projectName} \n')
        for feat in params['features']:
            if (feat in features_list):
                file.write("        " + features_list[feat][LIB_NAME] + '\n')
            if (feat in picow_options_list):
                file.write("        " + picow_options_list[feat][LIB_NAME] + '\n')
        file.write('        )\n\n')

    file.write(f'pico_add_extra_outputs({projectName})\n\n')

    file.close()


# Generates the requested project files, if any
def generateProjectFiles(projectPath, projectName, sdkPath, projects, debugger, sdkVersion, toolchainVersion, picotoolVersion, ninjaPath, cmakePath, openOCDVersion, useCmakeTools):

    oldCWD = os.getcwd()

    os.chdir(projectPath)

    # Add a simple .gitignore file if there isn't one
    if not os.path.isfile(".gitignore"):
        file = open(".gitignore", "w")
        file.write("build\n")
        file.close()

    debugger = debugger_config_list[debugger]

    if debugger == "raspberrypi-swd.cfg":
        shutil.copyfile(sourcefolder + "/" +  "raspberrypi-swd.cfg", projectPath / "raspberrypi-swd.cfg")

    # Need to escape windows files paths backslashes
    # TODO: env in currently not supported in compilerPath var
    #cPath = f"${{env:PICO_TOOLCHAIN_PATH_{envSuffix}}}" + os.path.sep + os.path.basename(str(compilerPath).replace('\\', '\\\\' ))
    cPath = compilerPath.as_posix() + (".exe" if isWindows else "")

    # if this is a path in the .pico-sdk homedir tell the settings to use the homevar
    user_home = os.path.expanduser("~").replace("\\", "/")
    use_home_var = f"{user_home}/.pico-sdk" in ninjaPath

    openocd_path = ""
    server_path = "\n            \"serverpath\"" # Because no \ in f-strings
    openocd_path_os = Path(user_home, relativeOpenOCDPath(openOCDVersion).replace("/", "", 1), "openocd.exe")
    if os.path.exists(openocd_path_os):
        openocd_path = f'{codeOpenOCDPath(openOCDVersion)}/openocd.exe'

    for p in projects :
        if p == 'vscode':
            launch = f'''{{
    "version": "0.2.0",
    "configurations": [
        {{
            "name": "Pico Debug (Cortex-Debug)",
            "cwd": "{"${workspaceRoot}" if not openocd_path else f"{codeOpenOCDPath(openOCDVersion)}/scripts"}",
            "executable": "${{command:raspberry-pi-pico.launchTargetPath}}",
            "request": "launch",
            "type": "cortex-debug",
            "servertype": "openocd",\
{f'{server_path}: "{openocd_path}",' if openocd_path else ""}
            "gdbPath": "${{command:raspberry-pi-pico.getGDBPath}}",
            "device": "${{command:raspberry-pi-pico.getChipUppercase}}",
            "configFiles": [
                "{debugger}",
                "target/${{command:raspberry-pi-pico.getTarget}}.cfg"
            ],
            "svdFile": "{codeSdkPath(sdkVersion)}/src/${{command:raspberry-pi-pico.getChip}}/hardware_regs/${{command:raspberry-pi-pico.getChipUppercase}}.svd",
            "runToEntryPoint": "main",
            // Fix for no_flash binaries, where monitor reset halt doesn't do what is expected
            // Also works fine for flash binaries
            "overrideLaunchCommands": [
                "monitor reset init",
                "load \\"${{command:raspberry-pi-pico.launchTargetPath}}\\""
            ],
            "openOCDLaunchCommands": [
                "adapter speed 5000"
            ]
        }},
        {{
            "name": "Pico Debug (Cortex-Debug with external OpenOCD)",
            "cwd": "${{workspaceRoot}}",
            "executable": "${{command:raspberry-pi-pico.launchTargetPath}}",
            "request": "launch",
            "type": "cortex-debug",
            "servertype": "external",
            "gdbTarget": "localhost:3333",
            "gdbPath": "${{command:raspberry-pi-pico.getGDBPath}}",
            "device": "${{command:raspberry-pi-pico.getChipUppercase}}",
            "svdFile": "{codeSdkPath(sdkVersion)}/src/${{command:raspberry-pi-pico.getChip}}/hardware_regs/${{command:raspberry-pi-pico.getChipUppercase}}.svd",
            "runToEntryPoint": "main",
            // Fix for no_flash binaries, where monitor reset halt doesn't do what is expected
            // Also works fine for flash binaries
            "overrideLaunchCommands": [
                "monitor reset init",
                "load \\"${{command:raspberry-pi-pico.launchTargetPath}}\\""
            ]
        }},
        {{
            "name": "Pico Debug (C++ Debugger)",
            "type": "cppdbg",
            "request": "launch",
            "cwd": "${{workspaceRoot}}",
            "program": "${{command:raspberry-pi-pico.launchTargetPath}}",
            "MIMode": "gdb",
            "miDebuggerPath": "${{command:raspberry-pi-pico.getGDBPath}}",
            "miDebuggerServerAddress": "localhost:3333",
            "debugServerPath": "{openocd_path if openocd_path else "openocd"}",
            "debugServerArgs": "-f {debugger} -f target/${{command:raspberry-pi-pico.getTarget}}.cfg -c \\"adapter speed 5000\\"",
            "serverStarted": "Listening on port .* for gdb connections",
            "filterStderr": true,
            "hardwareBreakpoints": {{
                "require": true,
                "limit": 4
            }},
            "preLaunchTask": "Flash",
            "svdPath": "{codeSdkPath(sdkVersion)}/src/${{command:raspberry-pi-pico.getChip}}/hardware_regs/${{command:raspberry-pi-pico.getChipUppercase}}.svd"
        }},
    ]
}}
'''

            base_headers_folder_name = "pico_base_headers" if semver_compare_ge(sdkVersion, "2.0.0") else "pico_base"
            properties = f'''{{
    "configurations": [
        {{
            "name": "Pico",
            "includePath": [
                "${{workspaceFolder}}/**",
                "{codeSdkPath(sdkVersion)}/**"
            ],
            "forcedInclude": [
                "{codeSdkPath(sdkVersion)}/src/common/{base_headers_folder_name}/include/pico.h",
                "${{workspaceFolder}}/build/generated/pico_base/pico/config_autogen.h"
            ],
            "defines": [],
            "compilerPath": "{cPath}",
            "compileCommands": "${{workspaceFolder}}/build/compile_commands.json",
            "cStandard": "c17",
            "cppStandard": "c++14",
            "intelliSenseMode": "linux-gcc-arm"
        }}
    ],
    "version": 4
}}
'''

            # kits
            kits = f'''[
    {{
        "name": "Pico",
        "compilers": {{
            "C": "${{command:raspberry-pi-pico.getCompilerPath}}",
            "CXX": "${{command:raspberry-pi-pico.getCompilerPath}}"
        }},
        "environmentVariables": {{
            "PATH": "${{command:raspberry-pi-pico.getEnvPath}};${{env:PATH}}"
        }},
        "cmakeSettings": {{
            "Python3_EXECUTABLE": "${{command:raspberry-pi-pico.getPythonPath}}"
        }}
    }}
]'''

            # settings
            settings = f'''{{
    "cmake.options.statusBarVisibility": "hidden",
    "cmake.options.advanced": {{
        "build": {{
            "statusBarVisibility": "hidden"
        }},
        "launch": {{
            "statusBarVisibility": "hidden"
        }},
        "debug": {{
            "statusBarVisibility": "hidden"
        }}
    }},
    "cmake.configureOnEdit": {"true" if useCmakeTools else "false"},
    "cmake.automaticReconfigure": {"true" if useCmakeTools else "false"},
    "cmake.configureOnOpen": {"true" if useCmakeTools else "false"},
    "cmake.generator": "Ninja",
    "cmake.cmakePath": "{cmakePath.replace(user_home, "${userHome}") if use_home_var else cmakePath}",
    "C_Cpp.debugShortcut": false,
    "terminal.integrated.env.windows": {{
        "PICO_SDK_PATH": "{propertiesSdkPath(sdkVersion, force_windows=True)}",
        "PICO_TOOLCHAIN_PATH": "{propertiesToolchainPath(toolchainVersion, force_windows=True)}",
        "Path": "\
{propertiesToolchainPath(toolchainVersion, force_windows=True)}/bin;\
{propertiesPicotoolPath(picotoolVersion, force_windows=True)}/picotool;\
{os.path.dirname(cmakePath.replace(user_home, "${env:USERPROFILE}") if use_home_var else cmakePath)};\
{os.path.dirname(ninjaPath.replace(user_home, "${env:USERPROFILE}") if use_home_var else ninjaPath)};\
${{env:PATH}}"
    }},
    "terminal.integrated.env.osx": {{
        "PICO_SDK_PATH": "{propertiesSdkPath(sdkVersion, force_non_windows=True)}",
        "PICO_TOOLCHAIN_PATH": "{propertiesToolchainPath(toolchainVersion, force_non_windows=True)}",
        "PATH": "\
{propertiesToolchainPath(toolchainVersion, force_non_windows=True)}/bin:\
{propertiesPicotoolPath(picotoolVersion, force_non_windows=True)}/picotool:\
{os.path.dirname(cmakePath.replace(user_home, "${env:HOME}") if use_home_var else cmakePath)}:\
{os.path.dirname(ninjaPath.replace(user_home, "${env:HOME}") if use_home_var else ninjaPath)}:\
${{env:PATH}}"
    }},
    "terminal.integrated.env.linux": {{
        "PICO_SDK_PATH": "{propertiesSdkPath(sdkVersion, force_non_windows=True)}",
        "PICO_TOOLCHAIN_PATH": "{propertiesToolchainPath(toolchainVersion, force_non_windows=True)}",
        "PATH": "\
{propertiesToolchainPath(toolchainVersion, force_non_windows=True)}/bin:\
{propertiesPicotoolPath(picotoolVersion, force_non_windows=True)}/picotool:\
{os.path.dirname(cmakePath.replace(user_home, "${env:HOME}") if use_home_var else cmakePath)}:\
{os.path.dirname(ninjaPath.replace(user_home, "${env:HOME}") if use_home_var else ninjaPath)}:\
${{env:PATH}}"
    }},
    "raspberry-pi-pico.cmakeAutoConfigure": {"false" if useCmakeTools else "true"},
    "raspberry-pi-pico.useCmakeTools": {"true" if useCmakeTools else "false"},
    "raspberry-pi-pico.cmakePath": "{cmakePath.replace(user_home, "${HOME}") if use_home_var else cmakePath}",
    "raspberry-pi-pico.ninjaPath": "{ninjaPath.replace(user_home, "${HOME}") if use_home_var else ninjaPath}"'''
                
            settings += '\n}\n'

            # extensions
            extensions = f'''{{
    "recommendations": [
        "marus25.cortex-debug",
        "ms-vscode.cpptools",
        "ms-vscode.cpptools-extension-pack",
        "ms-vscode.vscode-serial-monitor",
        "raspberry-pi.raspberry-pi-pico",
    ]
}}
'''
            tasks = f'''{{
    "version": "2.0.0",
    "tasks": [
        {{
            "label": "Compile Project",
            "type": "process",
            "isBuildCommand": true,
            "command": "{ninjaPath.replace(user_home, "${userHome}") if use_home_var else ninjaPath}",
            "args": ["-C", "${{workspaceFolder}}/build"],
            "group": "build",
            "presentation": {{
                "reveal": "always",
                "panel": "dedicated"
            }},
            "problemMatcher": "$gcc",
            "windows": {{
                "command": "{ninjaPath.replace(user_home, "${env:USERPROFILE}") if use_home_var else ninjaPath}.exe"
            }}
        }},
        {{
            "label": "Run Project",
            "type": "process",
            "command": "{propertiesPicotoolPath(picotoolVersion, force_non_windows=True)}/picotool/picotool",
            "args": [
                "load",
                "${{command:raspberry-pi-pico.launchTargetPath}}",
                "-fx"
            ],
            "presentation": {{
                "reveal": "always",
                "panel": "dedicated"
            }},
            "problemMatcher": [],
            "windows": {{
                "command": "{propertiesPicotoolPath(picotoolVersion, force_windows=True)}/picotool/picotool.exe"
            }}
        }},
        {{
            "label": "Flash",
            "type": "process",
            "command": "{openocd_path if openocd_path else "openocd"}",
            "args": [
                "-s",
                "{codeOpenOCDPath(openOCDVersion)}/scripts",
                "-f",
                "{debugger}",
                "-f",
                "target/${{command:raspberry-pi-pico.getTarget}}.cfg",
                "-c",
                "adapter speed 5000; program \\"${{command:raspberry-pi-pico.launchTargetPath}}\\" verify reset exit"
            ],
            "problemMatcher": [],
            "windows": {{
                "command": "{openocd_path.replace("${userHome}", "${env:USERPROFILE}") if openocd_path else "openocd"}",
            }}
        }}
    ]
}}
'''

            # Create a build folder, and run our cmake project build from it
            if not os.path.exists(VSCODE_FOLDER):
                os.mkdir(VSCODE_FOLDER)

            os.chdir(VSCODE_FOLDER)

            file = open(VSCODE_TASKS_FILENAME, 'w')
            file.write(tasks)
            file.close()

            filename = VSCODE_LAUNCH_FILENAME
            file = open(filename, 'w')
            file.write(launch)
            file.close()

            file = open(VSCODE_C_PROPERTIES_FILENAME, 'w')
            file.write(properties)
            file.close()

            file = open(VSCODE_CMAKE_KITS_FILENAME, 'w')
            file.write(kits)
            file.close()

            file = open(VSCODE_SETTINGS_FILENAME, 'w')
            file.write(settings)
            file.close()

            file = open(VSCODE_EXTENSIONS_FILENAME, 'w')
            file.write(extensions)
            file.close()

        else :
            print('Unknown project type requested')

    os.chdir(oldCWD)


def LoadConfigurations():
    try:
        with open(args.tsv) as tsvfile:
            reader = csv.DictReader(tsvfile, dialect='excel-tab')
            for row in reader:
                configuration_dictionary.append(row)
    except:
        print("No Pico configurations file found. Continuing without")

def LoadBoardTypes(sdkPath):
    # Scan the boards folder for all header files, extract filenames, and make a list of the results
    # default folder is <PICO_SDK_PATH>/src/boards/include/boards/*
    # If the PICO_BOARD_HEADER_DIRS environment variable is set, use that as well

    loc = sdkPath / "src/boards/include/boards"
    boards=[]
    for x in Path(loc).iterdir():
        if x.suffix == '.h':
            boards.append(x.stem)

    loc = os.getenv('PICO_BOARD_HEADER_DIRS')

    if loc != None:
        for x in Path(loc).iterdir():
            if x.suffix == '.h':
                boards.append(x.stem)

    return boards

def DoEverything(parent, params):
    global CMAKE_TOOLCHAIN_NAME

    if not os.path.exists(params['projectRoot']):
        print('Invalid project path')
        sys.exit(-1)

    oldCWD = os.getcwd()
    os.chdir(params['projectRoot'])

    # Create our project folder as subfolder
    os.makedirs(params['projectName'], exist_ok=True)

    os.chdir(params['projectName'])

    projectPath = params['projectRoot'] / params['projectName']

    # First check if there is already a project in the folder
    # If there is we abort unless the overwrite flag it set
    if os.path.exists(CMAKELIST_FILENAME):
        if not (params['wantOverwrite'] or params['wantConvert']):
            print('There already appears to be a project in this folder. Use the --overwrite option to overwrite the existing project')
            sys.exit(-1)

        # We should really confirm the user wants to overwrite
        #print('Are you sure you want to overwrite the existing project files? (y/N)')
        #c = input().split(" ")[0]
        #if c != 'y' and c != 'Y' :
        #    sys.exit(0)

    # Copy the SDK finder cmake file to our project folder
    # Can be found here <PICO_SDK_PATH>/external/pico_sdk_import.cmake
    shutil.copyfile(params['sdkPath'] / 'external' / 'pico_sdk_import.cmake', projectPath / 'pico_sdk_import.cmake' )

    if params['features']:
        features_and_examples = params['features'][:]
    else:
        features_and_examples = []

    if params['wantExamples']:
        features_and_examples = list(stdlib_examples_list.keys()) + features_and_examples

    if params['wantUARTExample']:
        # add uart to features_and_examples if not present
        if "uart" not in features_and_examples:
            features_and_examples.append("uart")

    if not (params['wantConvert']):
        GenerateMain(projectPath, params['projectName'], features_and_examples, params['wantCPP'], params['wantEntryProjName'])

        # If we have any ancilliary files, copy them to our project folder
        # Currently only the picow with lwIP support needs an extra file, so just check that list
        for feat in features_and_examples:
            if feat in features_list:
                if features_list[feat][ANCILLARY_FILE] != "":
                    shutil.copy(sourcefolder + "/" + features_list[feat][ANCILLARY_FILE], projectPath / features_list[feat][ANCILLARY_FILE])
            if feat in picow_options_list:
                if picow_options_list[feat][ANCILLARY_FILE] != "":
                    shutil.copy(sourcefolder + "/" + picow_options_list[feat][ANCILLARY_FILE], projectPath / picow_options_list[feat][ANCILLARY_FILE])

    GenerateCMake(projectPath, params)

    if params['wantExample']:
        if params['wantThreadsafeBackground'] or params['wantPoll']:
            # Write lwipopts for examples
            shutil.copy(sourcefolder + "/" + "lwipopts.h", projectPath / "lwipopts.h")

    # Create a build folder, and run our cmake project build from it
    if not os.path.exists('build'):
        os.mkdir('build')

    os.chdir('build')

    # If we are overwriting a previous project, we should probably clear the folder, but that might delete something the users thinks is important, so
    # for the moment, just delete the CMakeCache.txt file as certain changes may need that to be recreated.

    if os.path.exists(CMAKECACHE_FILENAME):
        os.remove(CMAKECACHE_FILENAME)

    cpus = os.cpu_count()
    if cpus == None:
        cpus = 1

    if isWindows:
        if shutil.which("ninja") or (params["ninjaPath"] != None and params["ninjaPath"] != ""):
            # When installing SDK version 1.5.0 on windows with installer pico-setup-windows-x64-standalone.exe, ninja is used 
            cmakeCmd = params['cmakePath'] + ' -G Ninja ..'
            makeCmd = params['ninjaPath'] + ' '        
        else:
            # Everything else assume nmake
            cmakeCmd = params['cmakePath'] + ' -G "NMake Makefiles" ..'
            makeCmd = 'nmake '
    else:
        # Ninja now works OK under Linux, so if installed use it by default. It's faster.
        if shutil.which("ninja") or (params["ninjaPath"] != None and params["ninjaPath"] != ""):
            cmakeCmd = params['cmakePath'] + ' -G Ninja ..'
            makeCmd = params['ninjaPath'] + ' '
        else:
            cmakeCmd = params['cmakePath'] + ' ..'
            makeCmd = 'make -j' + str(cpus)

    os.system(cmakeCmd)

    # Extract CMake Toolchain File
    if os.path.exists(CMAKECACHE_FILENAME):
        cacheFile = open(CMAKECACHE_FILENAME, "r")
        for line in cacheFile:
            if re.search("CMAKE_TOOLCHAIN_FILE:FILEPATH=", line):
                CMAKE_TOOLCHAIN_NAME = line.split("=")[-1].split("/")[-1].strip()

    if params['projects']:
        generateProjectFiles(
            projectPath, 
            params['projectName'], 
            params['sdkPath'], 
            params['projects'], 
            params['debugger'], 
            params["sdkVersion"], 
            params["toolchainVersion"], 
            params["picotoolVersion"], 
            params["ninjaPath"], 
            params["cmakePath"],
            params["openOCDVersion"],
            params['useCmakeTools'])

    if params['wantBuild']:
        os.system(makeCmd)
        print('\nIf the application has built correctly, you can now transfer it to the Raspberry Pi Pico board')

    os.chdir(oldCWD)


###################################################################################
# main execution starteth here

if __name__ == "__main__":
    sourcefolder = os.path.dirname(os.path.abspath(__file__))

    args = ParseCommandLine()

    if args.nouart:
        args.uart = False

    if args.debugger > len(debugger_list) - 1:
        args.debugger = 0

    if "RISCV" in args.toolchainVersion:
        if "COREV" in args.toolchainVersion:
            COMPILER_TRIPLE = COREV_TRIPLE
        else:
            COMPILER_TRIPLE = RISCV_TRIPLE

    # Check we have everything we need to compile etc
    c = CheckPrerequisites()

    ## TODO Do both warnings in the same error message so user does have to keep coming back to find still more to do

    if c == None:
        m = f'Unable to find the `{COMPILER_NAME()}` compiler\n'
        m +='You will need to install an appropriate compiler to build a Raspberry Pi Pico project\n'
        m += 'See the Raspberry Pi Pico documentation for how to do this on your particular platform\n'

        print(m)
        sys.exit(-1)

    if args.name == None and not args.gui and not args.list and not args.configs and not args.boardlist:
        print("No project name specfied\n")
        sys.exit(-1)

    # Check if we were provided a compiler path, and override the default if so
    if args.cpath:
        compilerPath = Path(args.cpath)
    elif args.toolchainVersion:
        compilerPath = Path(codeToolchainPath(args.toolchainVersion)+"/bin/"+COMPILER_NAME())
    else:
        compilerPath = Path(c)

    # load/parse any configuration dictionary we may have
    LoadConfigurations()

    p = CheckSDKPath(args.gui)

    if p == None:
        sys.exit(-1)

    sdkPath = Path(p)

    boardtype_list = LoadBoardTypes(sdkPath)
    boardtype_list.sort()

    projectRoot = Path(os.getcwd()) if not args.projectRoot else Path(args.projectRoot)

    if args.list or args.configs or args.boardlist:
        if args.list:
            print("Available project features:\n")
            for feat in features_list:
                print(feat.ljust(6), '\t', features_list[feat][GUI_TEXT])
            print('\n')

        if args.configs:
            print("Available project configuration items:\n")
            for conf in configuration_dictionary:
                print(conf['name'].ljust(40), '\t', conf['description'])
            print('\n')

        if args.boardlist:
            print("Available board types:\n")
            for board in boardtype_list:
                print(board)
            print('\n')

        sys.exit(0)
    else :
        params={
            'sdkPath'       : sdkPath,
            'projectRoot'   : projectRoot,
            'projectName'   : args.name,
            'wantGUI'       : False,
            'wantOverwrite' : args.overwrite,
            'wantConvert'   : args.convert or args.example,
            'wantExample'   : args.example,
            'wantThreadsafeBackground'  : False,
            'wantPoll'                  : False,
            'boardtype'     : args.boardtype,
            'wantBuild'     : args.build,
            'features'      : args.feature,
            'projects'      : args.project,
            'configs'       : (),
            'wantRunFromRAM': args.runFromRAM,
            'wantEntryProjName': args.entryProjName,
            'wantExamples'  : args.examples,
            'wantUARTExample': args.uartExample,
            'wantUART'      : args.uart,
            'wantUSB'       : args.usb,
            'wantCPP'       : args.cpp,
            'debugger'      : args.debugger,
            'exceptions'    : args.cppexceptions,
            'rtti'          : args.cpprtti,
            'ssid'          : '',
            'password'      : '',
            'sdkVersion'    : args.sdkVersion,
            'toolchainVersion': args.toolchainVersion,
            'picotoolVersion': args.picotoolVersion,
            'ninjaPath'     : args.ninjaPath,
            'cmakePath'     : args.cmakePath,
            'openOCDVersion': args.openOCDVersion,
            'exampleLibs'   : args.exampleLibs if args.exampleLibs is not None else [],
            'useCmakeTools' : args.useCmakeTools
            }

        DoEverything(None, params)
        sys.exit(0)
