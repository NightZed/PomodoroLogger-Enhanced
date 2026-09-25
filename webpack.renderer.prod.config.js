const { merge } = require('webpack-merge');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const path = require('path');
const fs = require('fs');
const baseConfig = require('./webpack.renderer.config');

if (!fs.existsSync('./webpack-visualization')) {
    fs.mkdirSync('./webpack-visualization');
}

module.exports = merge(baseConfig, {
    mode: 'production',
    plugins: [
        // Replaces webpack-visualizer-plugin, which only supports webpack 4.
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: path.resolve(__dirname, 'webpack-visualization/renderer.html'),
            openAnalyzer: false,
            logLevel: 'warn'
        })
    ]
});
