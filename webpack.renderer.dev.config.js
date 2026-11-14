const { merge } = require('webpack-merge');
const spawn = require('child_process').spawn;
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const baseConfig = require('./webpack.renderer.config');

module.exports = merge(baseConfig, {
    stats: 'errors-only',
    plugins: [new ReactRefreshWebpackPlugin()],
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
        // `overlay: false` keeps webpack-dev-server from drawing its own
        // runtime-error panel: ReactRefreshWebpackPlugin already puts one on
        // screen for the same `window` error event, and the second one only
        // became visible once the first was closed -- two windows for one
        // crash. The plugin's overlay also owns the compile errors, and this
        // setting does not affect the socket messages it reads.
        client: { logging: 'warn', overlay: false },
        // `devServer.before` was removed in webpack-dev-server 4.
        setupMiddlewares(middlewares) {
            if (process.env.START_HOT) {
                spawn('pnpm', ['run', 'start-main-dev'], {
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
