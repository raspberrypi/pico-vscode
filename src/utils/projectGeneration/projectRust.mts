/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/naming-convention */
import { join } from "path";
import { TomlInlineObject, writeTomlFile } from "./tomlUtil.mjs";
import Logger, { LoggerSource } from "../../logger.mjs";
import { unknownErrorToString } from "../errorHelper.mjs";
import { mkdir, writeFile } from "fs/promises";
import {
  GetChipCommand,
  GetOpenOCDRootCommand,
  GetPicotoolPathCommand,
  GetSVDPathCommand,
} from "../../commands/getPaths.mjs";
import { extensionName } from "../../commands/command.mjs";
import { commands, window } from "vscode";
import LaunchTargetPathCommand from "../../commands/launchTargetPath.mjs";

async function generateVSCodeConfig(projectRoot: string): Promise<boolean> {
  const vsc = join(projectRoot, ".vscode");

  // create extensions.json
  const extensions = {
    recommendations: [
      "marus25.cortex-debug",
      "rust-lang.rust-analyzer",
      "probe-rs.probe-rs-debugger",
      "raspberry-pi.raspberry-pi-pico",
    ],
  };

  const openOCDPath: string | undefined = await commands.executeCommand(
    `${extensionName}.${GetOpenOCDRootCommand.id}`
  );
  if (!openOCDPath) {
    Logger.error(LoggerSource.projectRust, "Failed to get OpenOCD path");

    void window.showErrorMessage("Failed to get OpenOCD path");

    return false;
  }

  // TODO: get commands dynamically
  const launch = {
    version: "0.2.0",
    configurations: [
      {
        name: "Pico Debug (probe-rs)",
        cwd: "${workspaceFolder}",
        request: "launch",
        type: "probe-rs-debug",
        connectUnderReset: false,
        speed: 5000,
        runtimeExecutable: "probe-rs",
        chip: `\${command:${extensionName}.${GetChipCommand.id}}`,
        runtimeArgs: ["dap-server"],
        flashingConfig: {
          flashingEnabled: true,
          haltAfterReset: false,
        },
        coreConfigs: [
          {
            coreIndex: 0,
            programBinary: `\${command:${extensionName}.${LaunchTargetPathCommand.id}}`,
            rttEnabled: true,
            svdFile: `\${command:${extensionName}.${GetSVDPathCommand.id}}`,
            rttChannelFormats: [
              {
                channelNumber: 0,
                dataFormat: "Defmt",
                mode: "NoBlockSkip",
                showTimestamps: true,
              },
            ],
          },
        ],
        preLaunchTask: "Compile Project (debug)",
        consoleLogLevel: "Debug",
        wireProtocol: "Swd",
      },
    ],
  };

  const settings = {
    "rust-analyzer.cargo.target": "thumbv8m.main-none-eabihf",
    "rust-analyzer.checkOnSave.allTargets": false,
    "editor.formatOnSave": true,
    "files.exclude": {
      ".pico-rs": true,
    },
  };

  const tasks = {
    version: "2.0.0",
    tasks: [
      {
        label: "Compile Project",
        type: "process",
        isBuildCommand: true,
        command: "cargo",
        args: ["build", "--release"],
        group: {
          kind: "build",
          isDefault: true,
        },
        presentation: {
          reveal: "always",
          panel: "dedicated",
        },
        problemMatcher: "$rustc",
        options: {
          env: {
            PICOTOOL_PATH: `\${command:${extensionName}.${GetPicotoolPathCommand.id}}`,
            CHIP: `\${command:${extensionName}.${GetChipCommand.id}}`,
          },
        },
      },
      {
        label: "Compile Project (debug)",
        type: "process",
        isBuildCommand: true,
        command: "cargo",
        args: ["build"],
        group: {
          kind: "build",
          isDefault: false,
        },
        presentation: {
          reveal: "always",
          panel: "dedicated",
        },
        problemMatcher: "$rustc",
        options: {
          env: {
            PICOTOOL_PATH: `\${command:${extensionName}.${GetPicotoolPathCommand.id}}`,
            CHIP: `\${command:${extensionName}.${GetChipCommand.id}}`,
          },
        },
      },
      {
        label: "Run Project",
        type: "shell",
        dependsOn: "Compile Project",
        command: `\${command:${extensionName}.${GetPicotoolPathCommand.id}}`,
        args: [
          "load",
          "-x",
          "${command:raspberry-pi-pico.launchTargetPathRelease}",
          "-t",
          "elf",
        ],
        presentation: {
          reveal: "always",
          panel: "dedicated",
        },
        problemMatcher: [],
      },
    ],
  };

  try {
    await mkdir(vsc, { recursive: true });
    await writeFile(join(vsc, "extensions.json"), JSON.stringify(extensions));
    await writeFile(join(vsc, "launch.json"), JSON.stringify(launch, null, 2));
    await writeFile(
      join(vsc, "settings.json"),
      JSON.stringify(settings, null, 2)
    );
    await writeFile(join(vsc, "tasks.json"), JSON.stringify(tasks, null, 2));

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write extensions.json file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateMainRs(projectRoot: string): Promise<boolean> {
  const mainRs = `//! # GPIO 'Blinky' Example
//!
//! This application demonstrates how to control a GPIO pin on the rp235x.
//!
//! It may need to be adapted to your particular board layout and/or pin assignment.
//!
//! See the \`Cargo.toml\` file for Copyright and license details.

#![no_std]
#![no_main]

use defmt::*;
use defmt_rtt as _;
use embedded_hal::delay::DelayNs;
use embedded_hal::digital::OutputPin;
#[cfg(target_arch = "riscv32")]
use panic_halt as _;
#[cfg(target_arch = "arm")]
use panic_probe as _;

// Alias for our HAL crate
use hal::entry;

#[cfg(rp2350)]
use rp235x_hal as hal;

#[cfg(rp2040)]
use rp2040_hal as hal;

// use bsp::entry;
// use bsp::hal;
// use rp_pico as bsp;

/// The linker will place this boot block at the start of our program image. We
/// need this to help the ROM bootloader get our code up and running.
/// Note: This boot block is not necessary when using a rp-hal based BSP
/// as the BSPs already perform this step.
#[link_section = ".boot2"]
#[used]
#[cfg(rp2040)]
pub static BOOT2: [u8; 256] = rp2040_boot2::BOOT_LOADER_GENERIC_03H;

// \`target_abi\`, \`target_arch\`, \`target_endian\`, 
// \`target_env\`, \`target_family\`, \`target_feature\`, 
// \`target_has_atomic\`, \`target_has_atomic_equal_alignment\`, 
// \`target_has_atomic_load_store\`, \`target_os\`, 
// \`target_pointer_width\`, \`target_thread_local\`, \`target_vendor\`
/// Tell the Boot ROM about our application
#[link_section = ".start_block"]
#[used]
#[cfg(rp2350)]
pub static IMAGE_DEF: hal::block::ImageDef = hal::block::ImageDef::secure_exe();

/// External high-speed crystal on the Raspberry Pi Pico 2 board is 12 MHz.
/// Adjust if your board has a different frequency
const XTAL_FREQ_HZ: u32 = 12_000_000u32;

/// Entry point to our bare-metal application.
///
/// The \`#[hal::entry]\` macro ensures the Cortex-M start-up code calls this function
/// as soon as all global variables and the spinlock are initialised.
///
/// The function configures the rp235x peripherals, then toggles a GPIO pin in
/// an infinite loop. If there is an LED connected to that pin, it will blink.
#[entry]
fn main() -> ! {
    info!("Program start");
    // Grab our singleton objects
    let mut pac = hal::pac::Peripherals::take().unwrap();

    // Set up the watchdog driver - needed by the clock setup code
    let mut watchdog = hal::Watchdog::new(pac.WATCHDOG);

    // Configure the clocks
    let clocks = hal::clocks::init_clocks_and_plls(
        XTAL_FREQ_HZ,
        pac.XOSC,
        pac.CLOCKS,
        pac.PLL_SYS,
        pac.PLL_USB,
        &mut pac.RESETS,
        &mut watchdog,
    )
    .unwrap();

    #[cfg(rp2040)]
    let mut timer = hal::Timer::new(pac.TIMER, &mut pac.RESETS, &clocks);

    #[cfg(rp2350)]
    let mut timer = hal::Timer::new_timer0(pac.TIMER0, &mut pac.RESETS, &clocks);

    // The single-cycle I/O block controls our GPIO pins
    let sio = hal::Sio::new(pac.SIO);

    // Set the pins to their default state
    let pins = hal::gpio::Pins::new(
        pac.IO_BANK0,
        pac.PADS_BANK0,
        sio.gpio_bank0,
        &mut pac.RESETS,
    );

    // Configure GPIO25 as an output
    let mut led_pin = pins.gpio25.into_push_pull_output();
    loop {
        info!("on!");
        led_pin.set_high().unwrap();
        timer.delay_ms(200);
        info!("off!");
        led_pin.set_low().unwrap();
        timer.delay_ms(200);
    }
}

/// Program metadata for \`picotool info\`
#[link_section = ".bi_entries"]
#[used]
pub static PICOTOOL_ENTRIES: [hal::binary_info::EntryAddr; 5] = [
    hal::binary_info::rp_cargo_bin_name!(),
    hal::binary_info::rp_cargo_version!(),
    hal::binary_info::rp_program_description!(c"Blinky Example"),
    hal::binary_info::rp_cargo_homepage_url!(),
    hal::binary_info::rp_program_build_attribute!(),
];

// End of file
`;

  try {
    await mkdir(join(projectRoot, "src"));
    await writeFile(join(projectRoot, "src", "main.rs"), mainRs);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write main.rs file",
      unknownErrorToString(error)
    );

    return false;
  }
}

export enum FlashMethod {
  openOCD,
  picotool,
}

/*
interface CargoTomlProfile {
  "codegen-units": number;
  debug: number | boolean;
  "debug-assertions": boolean;
  incremental?: boolean;
  lto?: string;
  "opt-level": number;
  "overflow-checks"?: boolean;
}*/

interface CargoTomlDependencies {
  [key: string]:
    | string
    | TomlInlineObject<{
        optional?: boolean;
        path?: string;
        version: string;
        features?: string[];
      }>;
}

interface CargoToml {
  package: {
    edition: string;
    name: string;
    version: string;
    license: string;
  };

  "build-dependencies": CargoTomlDependencies;
  dependencies: CargoTomlDependencies;

  /*
  profile?: {
    dev?: CargoTomlProfile & { "build-override"?: CargoTomlProfile };
    release?: CargoTomlProfile & { "build-override"?: CargoTomlProfile };
    test?: CargoTomlProfile & { "build-override"?: CargoTomlProfile };
    bench?: CargoTomlProfile & { "build-override"?: CargoTomlProfile };
  };*/

  target: {
    "'cfg( target_arch = \"arm\" )'": {
      dependencies: CargoTomlDependencies;
    };

    "'cfg( target_arch = \"riscv32\" )'": {
      dependencies: CargoTomlDependencies;
    };

    "thumbv6m-none-eabi": {
      dependencies: CargoTomlDependencies;
    };

    "riscv32imac-unknown-none-elf": {
      dependencies: CargoTomlDependencies;
    };

    '"thumbv8m.main-none-eabihf"': {
      dependencies: CargoTomlDependencies;
    };
  };
}

async function generateCargoToml(
  projectRoot: string,
  projectName: string
): Promise<boolean> {
  const obj: CargoToml = {
    package: {
      edition: "2021",
      name: projectName,
      version: "0.1.0",
      license: "MIT or Apache-2.0",
    },
    "build-dependencies": {
      regex: "1.11.0",
    },
    dependencies: {
      "cortex-m": "0.7",
      "cortex-m-rt": "0.7",
      "embedded-hal": "1.0.0",
      defmt: "0.3",
      "defmt-rtt": "0.4",
    },
    target: {
      "'cfg( target_arch = \"arm\" )'": {
        dependencies: {
          "panic-probe": new TomlInlineObject({
            version: "0.3",
            features: ["print-defmt"],
          }),
        },
      },
      "'cfg( target_arch = \"riscv32\" )'": {
        dependencies: {
          "panic-halt": new TomlInlineObject({
            version: "1.0.0",
          }),
        },
      },
      "thumbv6m-none-eabi": {
        dependencies: {
          "rp2040-hal": new TomlInlineObject({
            version: "0.11",
            features: ["rt", "critical-section-impl"],
          }),
          "rp2040-boot2": "0.3",
        },
      },

      "riscv32imac-unknown-none-elf": {
        dependencies: {
          "rp235x-hal": new TomlInlineObject({
            version: "0.3",
            features: ["rt", "critical-section-impl"],
          }),
        },
      },

      '"thumbv8m.main-none-eabihf"': {
        dependencies: {
          "rp235x-hal": new TomlInlineObject({
            version: "0.3",
            features: ["rt", "critical-section-impl"],
          }),
        },
      },
    },
  };

  // write to file
  try {
    await writeTomlFile(join(projectRoot, "Cargo.toml"), obj);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write Cargo.toml file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateMemoryLayouts(projectRoot: string): Promise<boolean> {
  const rp2040X = `MEMORY {
    BOOT2 : ORIGIN = 0x10000000, LENGTH = 0x100
    /*
     * Here we assume you have 2048 KiB of Flash. This is what the Pi Pico
     * has, but your board may have more or less Flash and you should adjust
     * this value to suit.
     */
    FLASH : ORIGIN = 0x10000100, LENGTH = 2048K - 0x100
    /*
     * RAM consists of 4 banks, SRAM0-SRAM3, with a striped mapping.
     * This is usually good for performance, as it distributes load on
     * those banks evenly.
     */
    RAM : ORIGIN = 0x20000000, LENGTH = 256K
    /*
     * RAM banks 4 and 5 use a direct mapping. They can be used to have
     * memory areas dedicated for some specific job, improving predictability
     * of access times.
     * Example: Separate stacks for core0 and core1.
     */
    SRAM4 : ORIGIN = 0x20040000, LENGTH = 4k
    SRAM5 : ORIGIN = 0x20041000, LENGTH = 4k

    /* SRAM banks 0-3 can also be accessed directly. However, those ranges
       alias with the RAM mapping, above. So don't use them at the same time!
    SRAM0 : ORIGIN = 0x21000000, LENGTH = 64k
    SRAM1 : ORIGIN = 0x21010000, LENGTH = 64k
    SRAM2 : ORIGIN = 0x21020000, LENGTH = 64k
    SRAM3 : ORIGIN = 0x21030000, LENGTH = 64k
    */
}

EXTERN(BOOT2_FIRMWARE)

SECTIONS {
    /* ### Boot loader
     *
     * An executable block of code which sets up the QSPI interface for
     * 'Execute-In-Place' (or XIP) mode. Also sends chip-specific commands to
     * the external flash chip.
     *
     * Must go at the start of external flash, where the Boot ROM expects it.
     */
    .boot2 ORIGIN(BOOT2) :
    {
        KEEP(*(.boot2));
    } > BOOT2
} INSERT BEFORE .text;

SECTIONS {
    /* ### Boot ROM info
     *
     * Goes after .vector_table, to keep it in the first 512 bytes of flash,
     * where picotool can find it
     */
    .boot_info : ALIGN(4)
    {
        KEEP(*(.boot_info));
    } > FLASH

} INSERT AFTER .vector_table;

/* move .text to start /after/ the boot info */
_stext = ADDR(.boot_info) + SIZEOF(.boot_info);

SECTIONS {
    /* ### Picotool 'Binary Info' Entries
     *
     * Picotool looks through this block (as we have pointers to it in our
     * header) to find interesting information.
     */
    .bi_entries : ALIGN(4)
    {
        /* We put this in the header */
        __bi_entries_start = .;
        /* Here are the entries */
        KEEP(*(.bi_entries));
        /* Keep this block a nice round size */
        . = ALIGN(4);
        /* We put this in the header */
        __bi_entries_end = .;
    } > FLASH
} INSERT AFTER .text;
`;

  const rp2350X = `MEMORY {
      /*
      * The RP2350 has either external or internal flash.
      *
      * 2 MiB is a safe default here, although a Pico 2 has 4 MiB.
      */
      FLASH : ORIGIN = 0x10000000, LENGTH = 2048K
      /*
      * RAM consists of 8 banks, SRAM0-SRAM7, with a striped mapping.
      * This is usually good for performance, as it distributes load on
      * those banks evenly.
      */
      RAM : ORIGIN = 0x20000000, LENGTH = 512K
      /*
      * RAM banks 8 and 9 use a direct mapping. They can be used to have
      * memory areas dedicated for some specific job, improving predictability
      * of access times.
      * Example: Separate stacks for core0 and core1.
      */
      SRAM4 : ORIGIN = 0x20080000, LENGTH = 4K
      SRAM5 : ORIGIN = 0x20081000, LENGTH = 4K
  }

  SECTIONS {
      /* ### Boot ROM info
      *
      * Goes after .vector_table, to keep it in the first 4K of flash
      * where the Boot ROM (and picotool) can find it
      */
      .start_block : ALIGN(4)
      {
          __start_block_addr = .;
          KEEP(*(.start_block));
      } > FLASH

  } INSERT AFTER .vector_table;

  /* move .text to start /after/ the boot info */
  _stext = ADDR(.start_block) + SIZEOF(.start_block);

  SECTIONS {
      /* ### Picotool 'Binary Info' Entries
      *
      * Picotool looks through this block (as we have pointers to it in our
      * header) to find interesting information.
      */
      .bi_entries : ALIGN(4)
      {
          /* We put this in the header */
          __bi_entries_start = .;
          /* Here are the entries */
          KEEP(*(.bi_entries));
          /* Keep this block a nice round size */
          . = ALIGN(4);
          /* We put this in the header */
          __bi_entries_end = .;
      } > FLASH
  } INSERT AFTER .text;

  SECTIONS {
      /* ### Boot ROM extra info
      *
      * Goes after everything in our program, so it can contain a signature.
      */
      .end_block : ALIGN(4)
      {
          __end_block_addr = .;
          KEEP(*(.end_block));
      } > FLASH

  } INSERT AFTER .uninit;

  PROVIDE(start_to_end = __end_block_addr - __start_block_addr);
  PROVIDE(end_to_start = __start_block_addr - __end_block_addr);
  `;

  const rp2350RiscvX = `MEMORY {
    /*
     * The RP2350 has either external or internal flash.
     *
     * 2 MiB is a safe default here, although a Pico 2 has 4 MiB.
     */
    FLASH : ORIGIN = 0x10000000, LENGTH = 2048K
    /*
     * RAM consists of 8 banks, SRAM0-SRAM7, with a striped mapping.
     * This is usually good for performance, as it distributes load on
     * those banks evenly.
     */
    RAM : ORIGIN = 0x20000000, LENGTH = 512K
    /*
     * RAM banks 8 and 9 use a direct mapping. They can be used to have
     * memory areas dedicated for some specific job, improving predictability
     * of access times.
     * Example: Separate stacks for core0 and core1.
     */
    SRAM4 : ORIGIN = 0x20080000, LENGTH = 4K
    SRAM5 : ORIGIN = 0x20081000, LENGTH = 4K
}

/* # Developer notes

- Symbols that start with a double underscore (__) are considered "private"

- Symbols that start with a single underscore (_) are considered "semi-public"; they can be
  overridden in a user linker script, but should not be referred from user code (e.g. \`extern "C" {
  static mut _heap_size }\`).

- \`EXTERN\` forces the linker to keep a symbol in the final binary. We use this to make sure a
  symbol is not dropped if it appears in or near the front of the linker arguments and "it's not
  needed" by any of the preceding objects (linker arguments)

- \`PROVIDE\` is used to provide default values that can be overridden by a user linker script

- On alignment: it's important for correctness that the VMA boundaries of both .bss and .data *and*
  the LMA of .data are all \`32\`-byte aligned. These alignments are assumed by the RAM
  initialization routine. There's also a second benefit: \`32\`-byte aligned boundaries
  means that you won't see "Address (..) is out of bounds" in the disassembly produced by \`objdump\`.
*/

PROVIDE(_stext = ORIGIN(FLASH));
PROVIDE(_stack_start = ORIGIN(RAM) + LENGTH(RAM));
PROVIDE(_max_hart_id = 0);
PROVIDE(_hart_stack_size = 2K);
PROVIDE(_heap_size = 0);

PROVIDE(InstructionMisaligned = ExceptionHandler);
PROVIDE(InstructionFault = ExceptionHandler);
PROVIDE(IllegalInstruction = ExceptionHandler);
PROVIDE(Breakpoint = ExceptionHandler);
PROVIDE(LoadMisaligned = ExceptionHandler);
PROVIDE(LoadFault = ExceptionHandler);
PROVIDE(StoreMisaligned = ExceptionHandler);
PROVIDE(StoreFault = ExceptionHandler);
PROVIDE(UserEnvCall = ExceptionHandler);
PROVIDE(SupervisorEnvCall = ExceptionHandler);
PROVIDE(MachineEnvCall = ExceptionHandler);
PROVIDE(InstructionPageFault = ExceptionHandler);
PROVIDE(LoadPageFault = ExceptionHandler);
PROVIDE(StorePageFault = ExceptionHandler);

PROVIDE(SupervisorSoft = DefaultHandler);
PROVIDE(MachineSoft = DefaultHandler);
PROVIDE(SupervisorTimer = DefaultHandler);
PROVIDE(MachineTimer = DefaultHandler);
PROVIDE(SupervisorExternal = DefaultHandler);
PROVIDE(MachineExternal = DefaultHandler);

PROVIDE(DefaultHandler = DefaultInterruptHandler);
PROVIDE(ExceptionHandler = DefaultExceptionHandler);

/* # Pre-initialization function */
/* If the user overrides this using the \`#[pre_init]\` attribute or by creating a \`__pre_init\` function,
   then the function this points to will be called before the RAM is initialized. */
PROVIDE(__pre_init = default_pre_init);

/* A PAC/HAL defined routine that should initialize custom interrupt controller if needed. */
PROVIDE(_setup_interrupts = default_setup_interrupts);

/* # Multi-processing hook function
   fn _mp_hook() -> bool;

   This function is called from all the harts and must return true only for one hart,
   which will perform memory initialization. For other harts it must return false
   and implement wake-up in platform-dependent way (e.g. after waiting for a user interrupt).
*/
PROVIDE(_mp_hook = default_mp_hook);

/* # Start trap function override
  By default uses the riscv crates default trap handler
  but by providing the \`_start_trap\` symbol external crates can override.
*/
PROVIDE(_start_trap = default_start_trap);

SECTIONS
{
  .text.dummy (NOLOAD) :
  {
    /* This section is intended to make _stext address work */
    . = ABSOLUTE(_stext);
  } > FLASH

  .text _stext :
  {
    /* Put reset handler first in .text section so it ends up as the entry */
    /* point of the program. */
    KEEP(*(.init));
    KEEP(*(.init.rust));
    . = ALIGN(4);
    __start_block_addr = .;
    KEEP(*(.start_block));
    . = ALIGN(4);
    *(.trap);
    *(.trap.rust);
    *(.text.abort);
    *(.text .text.*);
    . = ALIGN(4);
  } > FLASH

  /* ### Picotool 'Binary Info' Entries
    *
    * Picotool looks through this block (as we have pointers to it in our
    * header) to find interesting information.
    */
  .bi_entries : ALIGN(4)
  {
      /* We put this in the header */
      __bi_entries_start = .;
      /* Here are the entries */
      KEEP(*(.bi_entries));
      /* Keep this block a nice round size */
      . = ALIGN(4);
      /* We put this in the header */
      __bi_entries_end = .;
  } > FLASH

  .rodata : ALIGN(4)
  {
    *(.srodata .srodata.*);
    *(.rodata .rodata.*);

    /* 4-byte align the end (VMA) of this section.
       This is required by LLD to ensure the LMA of the following .data
       section will have the correct alignment. */
    . = ALIGN(4);
  } > FLASH

  .data : ALIGN(32)
  {
    _sidata = LOADADDR(.data);
    __sidata = LOADADDR(.data);
    _sdata = .;
    __sdata = .;
    /* Must be called __global_pointer$ for linker relaxations to work. */
    PROVIDE(__global_pointer$ = . + 0x800);
    *(.sdata .sdata.* .sdata2 .sdata2.*);
    *(.data .data.*);
    . = ALIGN(32);
    _edata = .;
    __edata = .;
  } > RAM AT > FLASH

  .bss (NOLOAD) : ALIGN(32)
  {
    _sbss = .;
    *(.sbss .sbss.* .bss .bss.*);
    . = ALIGN(32);
    _ebss = .;
  } > RAM

  .end_block : ALIGN(4)
  {
      __end_block_addr = .;
      KEEP(*(.end_block));
  } > FLASH

  /* fictitious region that represents the memory available for the heap */
  .heap (NOLOAD) :
  {
    _sheap = .;
    . += _heap_size;
    . = ALIGN(4);
    _eheap = .;
  } > RAM

  /* fictitious region that represents the memory available for the stack */
  .stack (NOLOAD) :
  {
    _estack = .;
    . = ABSOLUTE(_stack_start);
    _sstack = .;
  } > RAM

  /* fake output .got section */
  /* Dynamic relocations are unsupported. This section is only used to detect
     relocatable code in the input files and raise an error if relocatable code
     is found */
  .got (INFO) :
  {
    KEEP(*(.got .got.*));
  }

  .eh_frame (INFO) : { KEEP(*(.eh_frame)) }
  .eh_frame_hdr (INFO) : { *(.eh_frame_hdr) }
}

PROVIDE(start_to_end = __end_block_addr - __start_block_addr);
PROVIDE(end_to_start = __start_block_addr - __end_block_addr);


/* Do not exceed this mark in the error messages above                                    | */
ASSERT(ORIGIN(FLASH) % 4 == 0, "
ERROR(riscv-rt): the start of the FLASH must be 4-byte aligned");

ASSERT(ORIGIN(RAM) % 32 == 0, "
ERROR(riscv-rt): the start of the RAM must be 32-byte aligned");

ASSERT(_stext % 4 == 0, "
ERROR(riscv-rt): \`_stext\` must be 4-byte aligned");

ASSERT(_sdata % 32 == 0 && _edata % 32 == 0, "
BUG(riscv-rt): .data is not 32-byte aligned");

ASSERT(_sidata % 32 == 0, "
BUG(riscv-rt): the LMA of .data is not 32-byte aligned");

ASSERT(_sbss % 32 == 0 && _ebss % 32 == 0, "
BUG(riscv-rt): .bss is not 32-byte aligned");

ASSERT(_sheap % 4 == 0, "
BUG(riscv-rt): start of .heap is not 4-byte aligned");

ASSERT(_stext + SIZEOF(.text) < ORIGIN(FLASH) + LENGTH(FLASH), "
ERROR(riscv-rt): The .text section must be placed inside the FLASH region.
Set _stext to an address smaller than 'ORIGIN(FLASH) + LENGTH(FLASH)'");

ASSERT(SIZEOF(.stack) > (_max_hart_id + 1) * _hart_stack_size, "
ERROR(riscv-rt): .stack section is too small for allocating stacks for all the harts.
Consider changing \`_max_hart_id\` or \`_hart_stack_size\`.");

ASSERT(SIZEOF(.got) == 0, "
.got section detected in the input files. Dynamic relocations are not
supported. If you are linking to C code compiled using the \`gcc\` crate
then modify your build script to compile the C code _without_ the
-fPIC flag. See the documentation of the \`gcc::Config.fpic\` method for
details.");

/* Do not exceed this mark in the error messages above                                    | */
`;

  try {
    await writeFile(join(projectRoot, "rp2040.x"), rp2040X);
    await writeFile(join(projectRoot, "rp2350.x"), rp2350X);
    await writeFile(join(projectRoot, "rp2350_riscv.x"), rp2350RiscvX);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write memory.x files",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateBuildRs(projectRoot: string): Promise<boolean> {
  const buildRs = `//! Set up linker scripts for the rp235x-hal examples

use std::fs::{ File, read_to_string };
use std::io::Write;
use std::path::PathBuf;

use regex::Regex;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(rp2040)");
    println!("cargo::rustc-check-cfg=cfg(rp2350)");

    // Put the linker script somewhere the linker can find it
    let out = PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    println!("cargo:rustc-link-search={}", out.display());

    println!("cargo:rerun-if-changed=.pico-rs");
    let contents = read_to_string(".pico-rs")
        .map(|s| s.trim().to_string().to_lowercase())
        .unwrap_or_else(|e| {
            eprintln!("Failed to read file: {}", e);
            String::new()
        });

    // The file \`memory.x\` is loaded by cortex-m-rt's \`link.x\` script, which
    // is what we specify in \`.cargo/config.toml\` for Arm builds
    let target;
    if contents == "rp2040" {
        target = "thumbv6m-none-eabi";
        let memory_x = include_bytes!("rp2040.x");
        let mut f = File::create(out.join("memory.x")).unwrap();
        f.write_all(memory_x).unwrap();
        println!("cargo::rustc-cfg=rp2040");
        println!("cargo:rerun-if-changed=rp2040.x");
    } else {
        if contents.contains("riscv") {
            target = "riscv32imac-unknown-none-elf";
        } else {
            target = "thumbv8m.main-none-eabihf";
        }
        let memory_x = include_bytes!("rp2350.x");
        let mut f = File::create(out.join("memory.x")).unwrap();
        f.write_all(memory_x).unwrap();
        println!("cargo::rustc-cfg=rp2350");
        println!("cargo:rerun-if-changed=rp2350.x");
    }

    let re = Regex::new(r"target = .*").unwrap();
    let config_toml = include_str!(".cargo/config.toml");
    let result = re.replace(config_toml, format!("target = \\"{}\\"", target));
    let mut f = File::create(".cargo/config.toml").unwrap();
    f.write_all(result.as_bytes()).unwrap();

    // The file \`rp2350_riscv.x\` is what we specify in \`.cargo/config.toml\` for
    // RISC-V builds
    let rp2350_riscv_x = include_bytes!("rp2350_riscv.x");
    let mut f = File::create(out.join("rp2350_riscv.x")).unwrap();
    f.write_all(rp2350_riscv_x).unwrap();
    println!("cargo:rerun-if-changed=rp2350_riscv.x");

    println!("cargo:rerun-if-changed=build.rs");
}
`;

  try {
    await writeFile(join(projectRoot, "build.rs"), buildRs);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write build.rs file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateGitIgnore(projectRoot: string): Promise<boolean> {
  const gitIgnore = `# Created by https://www.toptal.com/developers/gitignore/api/rust,visualstudiocode,macos,windows,linux
# Edit at https://www.toptal.com/developers/gitignore?templates=rust,visualstudiocode,macos,windows,linux

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

### Rust ###
# Generated by Cargo
# will have compiled files and executables
debug/
target/

# Remove Cargo.lock from gitignore if creating an executable, leave it for libraries
# More information here https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html
Cargo.lock

# These are backup files generated by rustfmt
**/*.rs.bk

# MSVC Windows builds of rustc generate these, which store debugging information
*.pdb

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

# End of https://www.toptal.com/developers/gitignore/api/rust,visualstudiocode,macos,windows,linux
`;

  try {
    await writeFile(join(projectRoot, ".gitignore"), gitIgnore);

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

/**
 * Note: requires PICOTOOL_PATH to be set in the environment when running cargo.
 *
 * @param projectRoot The path where the project folder should be generated.
 */
async function generateCargoConfig(projectRoot: string): Promise<boolean> {
  const cargoConfig = `#
# Cargo Configuration for the https://github.com/rp-rs/rp-hal.git repository.
#
# You might want to make a similar file in your own repository if you are
# writing programs for Raspberry Silicon microcontrollers.
#

[build]
target = "thumbv8m.main-none-eabihf"
# Set the default target to match the Cortex-M33 in the RP2350
# target = "thumbv8m.main-none-eabihf"
# target = "thumbv6m-none-eabi"
# target = "riscv32imac-unknown-none-elf"

# Target specific options
[target.thumbv6m-none-eabi]
# Pass some extra options to rustc, some of which get passed on to the linker.
#
# * linker argument --nmagic turns off page alignment of sections (which saves
#   flash space)
# * linker argument -Tlink.x tells the linker to use link.x as the linker
#   script. This is usually provided by the cortex-m-rt crate, and by default
#   the version in that crate will include a file called \`memory.x\` which
#   describes the particular memory layout for your specific chip. 
# * no-vectorize-loops turns off the loop vectorizer (seeing as the M0+ doesn't
#   have SIMD)
rustflags = [
    "-C", "linker=flip-link",
    "-C", "link-arg=--nmagic",
    "-C", "link-arg=-Tlink.x",
    "-C", "link-arg=-Tdefmt.x",
    "-C", "no-vectorize-loops",
]

# Use picotool for loading.
#
# Load an elf, skipping unchanged flash sectors, verify it, and execute it
runner = "\${PICOTOOL_PATH} load -u -v -x -t elf"
#runner = "probe-rs run --chip \${CHIP} --protocol swd"

# This is the hard-float ABI for Arm mode.
#
# The FPU is enabled by default, and float function arguments use FPU
# registers.
[target.thumbv8m.main-none-eabihf]
# Pass some extra options to rustc, some of which get passed on to the linker.
#
# * linker argument --nmagic turns off page alignment of sections (which saves
#   flash space)
# * linker argument -Tlink.x tells the linker to use link.x as a linker script.
#   This is usually provided by the cortex-m-rt crate, and by default the
#   version in that crate will include a file called \`memory.x\` which describes
#   the particular memory layout for your specific chip. 
# * linker argument -Tdefmt.x also tells the linker to use \`defmt.x\` as a
#   secondary linker script. This is required to make defmt_rtt work.
rustflags = [
    "-C", "link-arg=--nmagic",
    "-C", "link-arg=-Tlink.x",
    "-C", "link-arg=-Tdefmt.x",
    "-C", "target-cpu=cortex-m33",
]

# Use picotool for loading.
#
# Load an elf, skipping unchanged flash sectors, verify it, and execute it
runner = "\${PICOTOOL_PATH} load -u -v -x -t elf"
#runner = "probe-rs run --chip \${CHIP} --protocol swd"

# This is the soft-float ABI for RISC-V mode.
#
# Hazard 3 does not have an FPU and so float function arguments use integer
# registers.
[target.riscv32imac-unknown-none-elf]
# Pass some extra options to rustc, some of which get passed on to the linker.
#
# * linker argument --nmagic turns off page alignment of sections (which saves
#   flash space)
# * linker argument -Trp235x_riscv.x also tells the linker to use
#   \`rp235x_riscv.x\` as a linker script. This adds in RP2350 RISC-V specific
#   things that the riscv-rt crate's \`link.x\` requires and then includes
#   \`link.x\` automatically. This is the reverse of how we do it on Cortex-M.
# * linker argument -Tdefmt.x also tells the linker to use \`defmt.x\` as a
#   secondary linker script. This is required to make defmt_rtt work.
rustflags = [
    "-C", "link-arg=--nmagic",
    "-C", "link-arg=-Trp2350_riscv.x",
    "-C", "link-arg=-Tdefmt.x",
]

# Use picotool for loading.
#
# Load an elf, skipping unchanged flash sectors, verify it, and execute it
runner = "\${PICOTOOL_PATH} load -u -v -x -t elf"
#runner = "probe-rs run --chip \${CHIP} --protocol swd"

[env]
DEFMT_LOG = "debug"
`;

  try {
    await mkdir(join(projectRoot, ".cargo"), { recursive: true });
    await writeFile(join(projectRoot, ".cargo", "config.toml"), cargoConfig);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write .cargo/config.toml file",
      unknownErrorToString(error)
    );

    return false;
  }
}

/**
 * Generates a new Rust project.
 *
 * @param projectRoot The path where the project folder should be generated.
 * @param projectName The name of the project.
 * @param flashMethod The flash method to use.
 * @returns A promise that resolves to true if the project was generated successfully.
 */
export async function generateRustProject(
  projectFolder: string,
  projectName: string
): Promise<boolean> {
  const picotoolPath: string | undefined = await commands.executeCommand(
    `${extensionName}.${GetPicotoolPathCommand.id}`
  );

  if (picotoolPath === undefined) {
    Logger.error(LoggerSource.projectRust, "Failed to get picotool path.");

    void window.showErrorMessage(
      "Failed to detect or install picotool. Please try again and check your settings."
    );

    return false;
  }
  const picotoolVersion = picotoolPath.match(
    /picotool[/\\]+(\d+\.\d+\.\d+)/
  )?.[1];

  if (!picotoolVersion) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to detect picotool version."
    );

    void window.showErrorMessage(
      "Failed to detect picotool version. Please try again and check your settings."
    );

    return false;
  }

  try {
    await mkdir(projectFolder, { recursive: true });
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
        "Failed to create project folder. Permission denied - Please check your permissions."
      );
    } else {
      Logger.error(
        LoggerSource.projectRust,
        "Failed to create project folder",
        unknownErrorToString(error)
      );

      void window.showErrorMessage(
        "Failed to create project folder. See the output panel for more details."
      );
    }

    return false;
  }

  // TODO: do all in parallel
  let result = await generateCargoToml(projectFolder, projectName);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate Cargo.toml file"
    );

    return false;
  }

  result = await generateMemoryLayouts(projectFolder);
  if (!result) {
    Logger.debug(LoggerSource.projectRust, "Failed to generate memory.x files");

    return false;
  }

  result = await generateBuildRs(projectFolder);
  if (!result) {
    Logger.debug(LoggerSource.projectRust, "Failed to generate build.rs file");

    return false;
  }

  result = await generateGitIgnore(projectFolder);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate .gitignore file"
    );

    return false;
  }

  result = await generateCargoConfig(projectFolder);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate .cargo/config.toml file"
    );

    return false;
  }

  result = await generateMainRs(projectFolder);
  if (!result) {
    Logger.debug(LoggerSource.projectRust, "Failed to generate main.rs file");

    return false;
  }

  result = await generateVSCodeConfig(projectFolder);
  if (!result) {
    Logger.debug(
      LoggerSource.projectRust,
      "Failed to generate .vscode configuration files."
    );

    return false;
  }

  // add .pico-rs file
  try {
    // TODO: dynamic selection of RP2040 or RP2350 (risc-v or arm)
    await writeFile(join(projectFolder, ".pico-rs"), "rp2350");
  } catch (error) {
    Logger.error(
      LoggerSource.projectRust,
      "Failed to write .pico-rs file",
      unknownErrorToString(error)
    );

    return false;
  }

  return true;
}
