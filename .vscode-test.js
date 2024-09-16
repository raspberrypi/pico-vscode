const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: ['out/test/**/*.test.js'],
  version: 'insiders',
  workspaceFolder: './testWorkspace',
  mocha: {
    ui: 'tdd',
    timeout: 120000,
  },
  skipExtensionDependencies: false
});
