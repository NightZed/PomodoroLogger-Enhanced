const { merge } = require('webpack-merge');
const spawn = require('child_process').spawn;

const baseConfig = require('./webpack.renderer.config');

module.exports = merge(baseConfig, {
    stats: 'errors-only',
    resolve: {
        alias: {
            'react-dom': '@hot-loader/react-dom'
        }
    },
    devServer: {
        port: 2003,
        compress: false,
        hot: true,
        headers: { 'Access-Control-Allow-Origin': '*' },
        historyApiFallback: {
            verbose: true,
            disableDotRule: false
        },
        // Everything the renderer needs is served from memory (HtmlWebpackPlugin
        // and CopyPlugin); `public` is only the template directory.
        static: false,
        client: { logging: 'warn' },
        // `devServer.before` was removed in webpack-dev-server 4.
        setupMiddlewares(middlewares) {
            if (process.env.START_HOT) {
                spawn('yarn', ['run', 'start-main-dev'], {
                    shell: true,
                    env: process.env,
                    stdio: 'inherit'
                })
                    .on('close', (code) => process.exit(code))
                    .on('error', (spawnError) => console.error(spawnError));
            }

            return middlewares;
        }
    }
});
