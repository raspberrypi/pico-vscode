// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
const fs = require('fs');
const { findByIds } = require('usb');

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

function getProjectTestConfigs(name, boards, cmakeToolsOptions, compileTimeout=10000) {
  const ret = [];
  for (const board of boards) {
    if (cmakeToolsOptions.includes(false)) {
      ret.push({
        name: `${name} Project Compilation Test without CMake Tools`,
        files: `out/projectCompilation/*.test.js`,
        workspaceFolder: `.vscode-test/sampleWorkspace/projects/default/${board}/${name}`,
        mocha: {
          ui: 'tdd',
          timeout: compileTimeout
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
          timeout: compileTimeout*2 // CMake Tools can take longer sometimes
        },
      });
    }
  }
  return ret;
}

const configs = [
  {
    name: `Project Creation Tests`,
    files: `out/projectCreation/*.test.js`,
    workspaceFolder: '.vscode-test/sampleWorkspace',
    mocha: {
      ui: 'tdd',
      timeout: 300000 // 5 minutes, as it will download everything
    },
  },
];

const debugProbe = findByIds(0x2E8A, 0x000C);
const rp2040 = findByIds(0x2E8A, 0x0003);
const rp2350 = findByIds(0x2E8A, 0x000f);
if (debugProbe) {
  console.log("Debugprobe found");
  console.log(debugProbe);

  if (rp2040) {
    console.log("RP2040 found");
    console.log(rp2040);
    Object.values(testNames).forEach(testName => {
      if (testName.boards.includes('pico')) {
        testName.runBoards.push('pico');
      }
      if (testName.boards.includes('pico_w')) {
        testName.runBoards.push('pico_w');
      }
    });
  } else {
    console.log("RP2040 not found");
  }
  
  if (rp2350) {
    console.log("RP2350 found");
    console.log(rp2350);
    Object.values(testNames).forEach(testName => {
      if (testName.boards.includes('pico2')) {
        testName.runBoards.push('pico2');
      }
      if (testName.boards.includes('pico2_w')) {
        testName.runBoards.push('pico2_w');
      }
    });
  } else {
    console.log("RP2350 not found");
  }
} else {
  console.log("Debugprobe not found - not running run tests");
}

for (const testName of Object.values(testNames)) {
  const { name, boards, runBoards, cmakeToolsOptions } = testName;
  configs.push(...getProjectTestConfigs(name, boards, cmakeToolsOptions));
}

fs.writeFileSync('out/projectCreation/testNames.json', JSON.stringify(testNames));
fs.writeFileSync('out/projectCompilation/testNames.json', JSON.stringify(testNames));

module.exports = defineConfig(configs);
