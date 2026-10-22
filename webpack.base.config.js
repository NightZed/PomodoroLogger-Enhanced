'use strict';
const path = require('path');

module.exports = {
    mode: 'development',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js'
    },
    node: {
        __dirname: false,
        __filename: false
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.json']
    },
    // enhanced-resolve's SymlinkPlugin records every path segment of a resolved
    // module (D:\, D:\Workspace, ...) as a file dependency, so Watchpack ends up
    // watching the drive root. When Windows touches a locked system file there,
    // `lstat` fails with EINVAL and Watchpack logs
    // `Watchpack Error (stats): Error: EINVAL: invalid argument, lstat 'D:\pagefile.sys'`.
    // Those files are irrelevant to the build, so keep them out of the watcher.
    watchOptions: {
        ignored: /(^|[/\\])(pagefile\.sys|hiberfil\.sys|swapfile\.sys|DumpStack\.log(\.tmp)?)$/i,
    },
    plugins: [
    ],
};
