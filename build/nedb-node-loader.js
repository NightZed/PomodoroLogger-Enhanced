/**
 * neDB ships a browser build (`browser-version/browser-specific/lib/storage.js`
 * and `customUtils.js`, selected through its `browser` field) that keeps its data
 * in localStorage through localforage. Pomodoro Logger stores every database as a
 * file, in the renderer as well as in its web workers, so those two modules are
 * replaced by the node implementations.
 *
 * A loader is used instead of a resolver plugin because module rules are the only
 * thing that is also applied inside the child compilations created by
 * worker-loader (a compiler plugin never sees them).
 */
const fs = require('fs');

module.exports = function nedbNodeLoader() {
    const nodeImplementation = this.resourcePath.replace(
        /browser-version[\\/]browser-specific[\\/]lib[\\/]/,
        'lib/'
    );

    // Keep the node file watched and cached together with the shim it replaces.
    this.addDependency(nodeImplementation);

    // The node source becomes the module content: rewriting the request instead
    // would be mapped straight back onto the shim by neDB's `browser` field.
    return fs.readFileSync(nodeImplementation, 'utf8');
};
