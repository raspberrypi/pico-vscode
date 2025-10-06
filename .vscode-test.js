// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
const fs = require('fs');

const testNames = [
  {
    'name': 'blink',
    'boards': ['pico2'],
  },
  {
    'name': 'hello_serial',
    'boards': ['pico2'],
  },
];

fs.writeFileSync('out/projectCreation/testNames.json', JSON.stringify(testNames));

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

for (const testName of testNames) {
  const { name, boards } = testName;
  configs.push(...getProjectTestConfigs(name, boards));
}

module.exports = defineConfig(configs);
