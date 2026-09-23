const webpack = require('webpack');
const merge = require('webpack-merge');

const baseConfig = require('./webpack.base.config');

module.exports = merge.smart(baseConfig, {
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
            {
                test: /\.(gif|png|jpe?g)$/,
                use: [
                    'file-loader',
                    {
                        loader: 'image-webpack-loader',
                        options: {
                            disable: true,
                        },
                    },
                ],
            },
            {
                test: /\.dat$/,
                use: 'file-loader',
            },
            {
                test: /\.worker\.js$/,
                use: { loader: 'index-loader' },
            },
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
    },
});
