import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

const isProduction = process.env.BUILD === 'production';

export default {
    input: 'src/extension.mts',
    output: {
        //dir: 'dist',
        file: 'dist/extension.cjs',
        format: 'cjs',
        // isProduction ? "hidden" : true
        sourcemap: true,
        exports: 'named',
    },
    external: [
        'vscode'
    ],
    plugins: [
        nodeResolve({
            preferBuiltins: true
        }),
        commonjs(),
        typescript({
            tsconfig: 'tsconfig.json',
        }),
    ],
};
