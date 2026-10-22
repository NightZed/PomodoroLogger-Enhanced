const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { build } = require('./package');
const baseConfig = require('./webpack.base.config');

module.exports = merge(baseConfig, {
    target: 'electron-renderer',
    entry: {
        app: ['./src/renderer/app.tsx']
    },
    module: {
        rules: [
                        {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,
                        babelrc: false,
                        presets: [
                            ['@babel/preset-env', {
                                // This config builds `target: 'electron-renderer'`
                                // only, so the code never runs in a browser.
                                // `last 2 versions` made preset-env downlevel for
                                // browsers the app cannot run in, pulling in
                                // transform-async-to-generator / transform-classes.
                                // Those modern helpers call NodePath APIs that a
                                // stale nested @babel/traverse (7.17, installed
                                // under @babel/core) does not have, which made any
                                // re-transpiled file fail with
                                // "path.ensureFunctionName is not a function".
                                // Compile for Electron instead. The value is a
                                // minimum, not the exact bundled version: the
                                // app ships its own Electron, so there is no
                                // older runtime to support, and a future
                                // Electron upgrade does not require touching
                                // this line (it only means a few features stay
                                // transpiled a little longer than necessary).
                                targets: { electron: '39' },
                                modules: false
                            }],
                            '@babel/preset-typescript',
                            '@babel/preset-react'
                        ],
                        plugins: [
                            '@babel/plugin-transform-runtime',
                            ...(process.env.NODE_ENV === 'development' ? ['react-refresh/babel'] : [])
                        ]
                    }
                }
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader']
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                use: [
                    {
                        loader: 'babel-loader'
                    },
                    {
                        loader: '@svgr/webpack',
                        options: {
                            icon: true
                        }
                    }
                ]
            },
            {
                // url-loader with an 8kb inline limit -> webpack 5 asset module
                test: /\.(gif|png|jpe?g)$/,
                type: 'asset',
                parser: {
                    dataUrlCondition: { maxSize: 8192 }
                }
            },
            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            {
                enforce: 'pre',
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'source-map-loader'
            },
            {
                test: /\.(dat|mp3)$/,
                type: 'asset/resource'
            }
        ]
        },
    plugins: [
        // Type checking is done by `yarn typecheck` (see webpack.main.config.js).
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'public'),
                    to: path.resolve(__dirname, 'dist'),
                    // index.html is the HtmlWebpackPlugin template: copying it would
                    // clash with the generated file (webpack 5 errors on that).
                    globOptions: { ignore: ['**/index.html'] }
                }
            ]
        }),
        new HtmlWebpackPlugin({
            title: build.productName,
            template: 'public/index.html',
            inject: true
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
        })
    ],
    resolve: {
        alias: {}
    }
});
