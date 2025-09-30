//@ts-check

'use strict';

const path = require('node:path');

//@ts-ignore
module.exports = (_env, argv) => {
  const isProd = argv.mode === 'production';

  /** @type {import('webpack').Configuration} */
  const config = {
    name: 'extension',
    target: 'node',
    mode: isProd ? 'production' : 'development',
    entry: './src/extension.mts',
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
      //devtoolModuleFilenameTemplate: '../[resource-path]',
      // Use standard webpack source paths; easier to map
      //devtoolModuleFilenameTemplate: 'webpack:///[resource-path]',
      //devtoolFallbackModuleFilenameTemplate: 'webpack:///[resource-path]'
    },
    node: {
      __dirname: false,
    },
    devtool: isProd ? 'hidden-source-map' : 'inline-source-map',
    externals: {
      vscode: "commonjs vscode"
    },
    resolve: {
      extensions: ['.mts', '.ts', '.mjs', '.js'],
      mainFields: ['main', 'module'],
      extensionAlias: {
        '.mjs': ['.mts', '.mjs'], // allow imports written as ./file.mjs to resolve ./file.mts
        '.js': ['.ts', '.js'],  // allow imports written as ./file.js  to resolve ./file.ts
      },
    },
    module: {
      rules: [{
        test: /\.[cm]?ts$/,
        exclude: /node_modules/,
        use: [{
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          }
        }]
      }, {
        test: /.node$/,
        loader: 'node-loader',
      }]
    },
    optimization: {
      minimize: isProd
    },
    stats: {
      warnings: false
    }
  };

  /** @type {import('webpack').Configuration} */
  const uninstallerEsm = {
    name: 'uninstaller',
    target: 'node',
    mode: 'production',
    entry: './scripts/vscodeUninstaller.mjs',
    experiments: { outputModule: true, topLevelAwait: true },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'vscodeUninstaller.mjs',
      library: { type: 'module' },
      chunkFormat: 'module',
      clean: false,
    },
    devtool: false,
    resolve: { extensions: ['.mjs', '.js'] },
  };

  return [config, uninstallerEsm];
};
