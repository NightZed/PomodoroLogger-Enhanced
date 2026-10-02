const { merge } = require('webpack-merge');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const webpack = require('webpack');
const path = require('path');
const fs = require('fs');
const baseConfig = require('./webpack.main.config');

if (!fs.existsSync('./webpack-visualization')) {
    fs.mkdirSync('./webpack-visualization');
}

// disable source-map in production build
baseConfig.devtool = false;
baseConfig.watch = false;
module.exports = merge(baseConfig, {
    mode: 'production',
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
        }),
        // Replaces webpack-visualizer-plugin, which only supports webpack 4.
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: path.resolve(__dirname, 'webpack-visualization/main.html'),
            openAnalyzer: false,
            logLevel: 'warn'
        })
    ],
});
