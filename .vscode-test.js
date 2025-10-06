// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
const fs = require('fs');
const { findByIds } = require('usb');

const testNames = {
  'blink': {
    'name': 'blink',
    'boards': ['pico', 'pico_w', 'pico2', 'pico2_w'],
    'runBoards': [],
  },
  'hello_serial': {
    'name': 'hello_serial',
    'boards': ['pico', 'pico_w', 'pico2', 'pico2_w'],
    'runBoards': [],
  },
};

function getProjectTestConfigs(name, boards, compileTimeout=10000) {
  const ret = [];
  for (const board of boards) {
    ret.push({
      name: `${name} Project Compilation Test`,
      files: `out/projectCompilation/*.test.js`,
      workspaceFolder: `.vscode-test/sampleWorkspace/projects/${board}/${name}`,
      mocha: {
        ui: 'tdd',
        timeout: compileTimeout
      },
    });
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
      timeout: 10000
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
  const { name, boards, runBoards } = testName;
  configs.push(...getProjectTestConfigs(name, boards));
}

fs.writeFileSync('out/projectCreation/testNames.json', JSON.stringify(testNames));
fs.writeFileSync('out/projectCompilation/testNames.json', JSON.stringify(testNames));

module.exports = defineConfig(configs);
