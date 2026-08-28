// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findByIds } = require('usb');

const VENDOR_ID = 0x2E8A;
const PROBE_PID = 0x000C;
// Product id a board enumerates as in BOOTSEL mode, per chip. Doubles as a
// picotool device selector once Erase Start has dropped a board into BOOTSEL.
const BOOTSEL_PIDS = {
  'rp2040': 0x0003,
  'rp2350': 0x000F,
};
// The chip each board name is built for.
const BOARD_CHIPS = {
  'pico': 'rp2040',
  'pico_w': 'rp2040',
  'pico2': 'rp2350',
  'pico2_w': 'rp2350',
};
const OPENOCD_TARGETS = {
  'rp2040': 'target/rp2040.cfg',
  'rp2350': 'target/rp2350.cfg',
};

// openocd is only used to work out which board each debug probe is wired to,
// so the system one is fine - this runs before the extension has downloaded
// its own.
const openocd = process.env.PICO_VSCODE_TEST_OPENOCD || 'openocd';
const openocdInterface =
  process.env.PICO_VSCODE_TEST_OPENOCD_INTERFACE || 'interface/cmsis-dap.cfg';
// A self-hosted Pi compiles and downloads far slower than a hosted runner, so
// let the rig stretch every timeout instead of hard-coding the worst case.
const timeoutScale = Number(process.env.PICO_VSCODE_TEST_TIMEOUT_SCALE) || 1;

// Zephyr sets up a whole workspace, SDK and venv on first run, so these are
// opt-in: set PICO_VSCODE_TEST_ZEPHYR=1 to include them.
const runZephyrTests = process.env.PICO_VSCODE_TEST_ZEPHYR === '1';
const zephyrTests = [
  { name: 'zephyr_hello', board: 'pico', template: 'simple', console: 'UART' },
  { name: 'zephyr_blinky', board: 'pico2', template: 'blinky', console: 'UART' },
];

const testNames = {
  'blink': {
    'name': 'blink',
    'boards': ['pico', 'pico_w', 'pico2', 'pico2_w'],
    'runBoards': [],
    'cmakeToolsOptions': [true, false],
  },
  'hello_serial': {
    'name': 'hello_serial',
    'boards': ['pico', 'pico_w', 'pico2', 'pico2_w'],
    'runBoards': [],
    'cmakeToolsOptions': [false],
  },
};

function getProjectTestConfigs(name, boards, cmakeToolsOptions, compileTimeout=30000) {
  const ret = [];
  for (const board of boards) {
    if (cmakeToolsOptions.includes(false)) {
      ret.push({
        name: `${name} Project Compilation Test without CMake Tools`,
        files: `out/projectCompilation/*.test.js`,
        workspaceFolder: `.vscode-test/sampleWorkspace/projects/default/${board}/${name}`,
        mocha: {
          ui: 'tdd',
          timeout: compileTimeout * timeoutScale,
        },
      });
    }
    if (cmakeToolsOptions.includes(true)) {
      ret.push({
        name: `${name} Project Compilation Test with CMake Tools`,
        files: `out/projectCompilation/*.test.js`,
        workspaceFolder: `.vscode-test/sampleWorkspace/projects/cmakeTools/${board}/${name}`,
        installExtensions: [
          'ms-vscode.cmake-tools',
        ],
        mocha: {
          ui: 'tdd',
          timeout: (compileTimeout + 10000) * timeoutScale,  // 10s of wait time
        },
      });
    }
  }
  return ret;
}

/**
 * Serial number of every attached debug probe.
 *
 * Read out of sysfs, which is synchronous (this config file is evaluated as
 * plain CommonJS) and needs no permissions, unlike opening each device to ask
 * for its serial-number string descriptor. Returns null where there's no
 * sysfs to read, so callers can fall back to single-probe detection.
 */
function listProbeSerials() {
  const usbDevices = '/sys/bus/usb/devices';
  let entries;
  try {
    entries = fs.readdirSync(usbDevices);
  } catch {
    return null;
  }

  const read = (entry, name) => {
    try {
      return fs.readFileSync(path.join(usbDevices, entry, name), 'utf8').trim();
    } catch {
      return '';
    }
  };

  const serials = [];
  for (const entry of entries) {
    if (parseInt(read(entry, 'idVendor'), 16) !== VENDOR_ID) {
      continue;
    }
    if (parseInt(read(entry, 'idProduct'), 16) !== PROBE_PID) {
      continue;
    }
    const serial = read(entry, 'serial');
    if (serial) {
      serials.push(serial);
    }
  }
  return serials;
}

/**
 * Whether the probe with this serial is wired to a board running `chip`.
 *
 * Connects and examines the target without resetting it, so it leaves a
 * running application alone - including when pointed at the wrong chip, which
 * simply fails to attach.
 */
function probeTargetsChip(serial, chip) {
  const args = ['-f', openocdInterface, '-c', `adapter serial ${serial}`];
  if (chip === 'rp2350') {
    // RP2350 puts several debug ports on the one SWD line, so address it
    // explicitly rather than relying on whichever answers first.
    args.push('-c', 'set SWD_MULTIDROP 1');
  }
  args.push('-f', OPENOCD_TARGETS[chip], '-c', 'init', '-c', 'exit');

  try {
    execFileSync(openocd, args, { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Chip -> debug probe serial, for every board that can be run on.
 *
 * The hardware rig has an RP2040 and an RP2350 attached at once, each with its
 * own debug probe, so "is a probe present, and is some board in BOOTSEL" no
 * longer identifies anything: it can't say which probe drives which chip, and
 * a board running an application isn't in BOOTSEL to be seen at all. Ask each
 * probe what it's attached to instead.
 */
function detectProbes() {
  const configured = {};
  for (const chip of Object.keys(BOOTSEL_PIDS)) {
    const serial = process.env[`PICO_VSCODE_TEST_PROBE_${chip.toUpperCase()}`];
    if (serial) {
      configured[chip] = serial;
    }
  }
  if (Object.keys(configured).length > 0) {
    console.log('Debug probes taken from the environment:', configured);
    return configured;
  }

  const serials = listProbeSerials();
  if (serials === null) {
    return detectSingleProbe();
  }
  if (serials.length === 0) {
    console.log('Debugprobe not found - not running run tests');
    return {};
  }

  const probes = {};
  for (const serial of serials) {
    let found;
    for (const chip of Object.keys(OPENOCD_TARGETS)) {
      if (probes[chip] === undefined && probeTargetsChip(serial, chip)) {
        found = chip;
        break;
      }
    }
    if (found === undefined) {
      console.log(`Debugprobe ${serial} is not attached to a known board`);
    } else {
      console.log(`Debugprobe ${serial} is attached to an ${found}`);
      probes[found] = serial;
    }
  }
  return probes;
}

/**
 * Fallback for hosts with no sysfs to read - a single probe, with each board
 * identified by sitting in BOOTSEL mode. Probe serials aren't known here, so
 * the generated tasks are left unpinned, which is right for a desk with one
 * board attached.
 */
function detectSingleProbe() {
  const debugProbe = findByIds(VENDOR_ID, PROBE_PID);
  if (!debugProbe) {
    console.log("Debugprobe not found - not running run tests");
    return {};
  }
  console.log("Debugprobe found");
  console.log(debugProbe);

  const probes = {};
  for (const [chip, pid] of Object.entries(BOOTSEL_PIDS)) {
    const board = findByIds(VENDOR_ID, pid);
    if (board) {
      console.log(`${chip} found`);
      console.log(board);
      probes[chip] = null;
    } else {
      console.log(`${chip} not found`);
    }
  }
  return probes;
}

const configs = [
  {
    name: `Project Creation Tests`,
    files: `out/projectCreation/*.test.js`,
    workspaceFolder: '.vscode-test/sampleWorkspace',
    mocha: {
      ui: 'tdd',
      timeout: 300000 * timeoutScale, // 5 minutes, as it will download everything
    },
  },
];

const probes = detectProbes();

for (const testName of Object.values(testNames)) {
  for (const board of testName.boards) {
    if (BOARD_CHIPS[board] in probes) {
      testName.runBoards.push(board);
    }
  }
}

for (const testName of Object.values(testNames)) {
  const { name, boards, runBoards, cmakeToolsOptions } = testName;
  configs.push(...getProjectTestConfigs(name, boards, cmakeToolsOptions));
}

if (runZephyrTests) {
  configs.push({
    name: `Zephyr Project Creation Tests`,
    files: `out/zephyrProjectCreation/*.test.js`,
    workspaceFolder: '.vscode-test/sampleWorkspace',
    mocha: {
      ui: 'tdd',
      // the first one installs the Zephyr workspace, SDK and venv from scratch
      timeout: 3600000 * timeoutScale,
    },
  });

  for (const { name, board } of zephyrTests) {
    configs.push({
      name: `${name} Zephyr Project Compilation Test`,
      files: `out/zephyrProjectCompilation/*.test.js`,
      workspaceFolder: `.vscode-test/sampleWorkspace/zephyrProjects/${board}/${name}`,
      mocha: {
        ui: 'tdd',
        timeout: 600000 * timeoutScale,
      },
    });
  }
}

// How the hardware is wired up, for the project creation tests to pin each new
// project's tasks to the board it was created for.
const rig = {
  probeSerials: probes,
  boardChips: BOARD_CHIPS,
  bootselPids: BOOTSEL_PIDS,
};

fs.writeFileSync('out/projectCreation/testNames.json', JSON.stringify(testNames));
fs.writeFileSync('out/projectCompilation/testNames.json', JSON.stringify(testNames));
fs.writeFileSync('out/projectCreation/rig.json', JSON.stringify(rig));
if (runZephyrTests) {
  fs.writeFileSync('out/zephyrProjectCreation/zephyrTests.json', JSON.stringify(zephyrTests));
}

module.exports = defineConfig(configs);
