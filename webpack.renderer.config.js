const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { build } = require('./package');
const baseConfig = require('./webpack.base.config');
/**
 * neDB's browser build would store the databases in localStorage instead of on
 * disk, see `build/nedb-node-loader.js`.
 */
const fixNedbForElectronRenderer = {
    test: /nedb[\\/]browser-version[\\/]browser-specific[\\/]lib[\\/](storage|customUtils)\.js$/,
    use: { loader: path.resolve(__dirname, 'build/nedb-node-loader.js') }
};


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
                                targets: { browsers: 'last 2 versions' },
                                modules: false
                            }],
                            '@babel/preset-typescript',
                            '@babel/preset-react'
                        ],
                        plugins: [
                            '@babel/plugin-transform-runtime',
                            ['@babel/plugin-proposal-class-properties', { loose: true }]
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
            },
            fixNedbForElectronRenderer
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
        alias: {
            echarts$: 'echarts/lib/echarts.js',
        }
    }
});
