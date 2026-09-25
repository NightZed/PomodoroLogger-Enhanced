const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');
const baseConfig = require('./webpack.base.config');

module.exports = merge(baseConfig, {
    mode: process.env.NODE_ENV,
    target: 'web',
    entry: {
        app: ['@babel/polyfill'],
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            babelrc: false,
                            presets: [
                                '@babel/preset-react',
                                '@babel/preset-env',
                                '@babel/preset-typescript',
                            ],
                            plugins: [
                                '@babel/plugin-proposal-optional-chaining',
                                '@babel/plugin-transform-runtime',
                                ['@babel/plugin-proposal-class-properties', { loose: true }],
                            ],
                        },
                    },
                    {
                        loader: 'react-docgen-typescript-loader'
                    }
                ],
            },
            {
                test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                use: [
                    {
                        loader: 'babel-loader',
                    },
                    {
                        loader: '@svgr/webpack',
                        options: {
                            babel: true,
                            icon: true,
                        },
                    },
                ],
            },
            {
                test: /\.(gif|png|jpe?g)$/,
                type: 'asset',
                parser: {
                    dataUrlCondition: { maxSize: 8192 }
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
        ],
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NamedModulesPlugin(),
    ],
});
