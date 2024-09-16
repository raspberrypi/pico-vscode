import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: ['out/test/**/*.test.mts'],
  version: 'insiders',
  workspaceFolder: './testWorkspace',
  mocha: {
    ui: 'tdd',
    timeout: 60000,
  },
  skipExtensionDependencies: false
});
