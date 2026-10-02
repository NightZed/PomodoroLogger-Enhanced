const webpack = require('webpack');
const { merge } = require('webpack-merge');

const baseConfig = require('./webpack.base.config');

module.exports = merge(baseConfig, {
    target: 'electron-main',
    entry: {
        main: './src/main/main.ts',
        preload: './src/main/preload.ts',
        worker: './src/main/worker/worker.ts',
    },
    module: {
        rules: [
            {
                test: [/\.jsx?$/, /\.tsx?$/],
                exclude: /node_modules/,
                loader: 'ts-loader',
            },
            // Images and .dat files are emitted next to `main.js` and resolved at
            // runtime through `path.join(__dirname, ...)` (asset modules replace
            // file-loader, which only supports webpack 4).
            { test: /\.(gif|png|jpe?g)$/, type: 'asset/resource' },
            { test: /\.dat$/, type: 'asset/resource' },
        ],
    },
    watch: true,
    plugins: [
        // Type checking is done by `yarn typecheck` (tsc --noEmit -p tsconfig.json)
        // instead of fork-ts-checker-webpack-plugin: the 1.x version used before
        // crashed webpack ("Cannot read properties of undefined (reading 'dispatch')")
        // on shutdown, and its successors need a different options schema (and
        // webpack 5 for the current releases).
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        }),
    ],
    externals: {
        'active-win': 'commonjs2 active-win',
        'electron-updater': 'commonjs2 electron-updater',
        'builder-util-runtime': 'commonjs2 builder-util-runtime',
    },
});
