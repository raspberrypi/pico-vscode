import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
  input: ['src/test/runTest.ts', 'src/test/suite/index.ts', 'src/test/suite/extension.test.ts', 'src/extension.ts'],
  output: {
    dir: 'out',
    format: 'cjs',
    sourcemap: true,
    exports: 'named',
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  external: [
    'vscode',
    'mocha',
    '@vscode/test-electron'
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: 'tsconfig.json'
    }),
    json(),
  ],
};
