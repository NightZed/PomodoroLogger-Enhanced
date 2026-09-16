// Compatibility shim for the legacy `util` type-check helpers that Node 22 removed.
//
// nedb@1.8.0 (used by src/utils/dbHelper.ts and the renderer actions that persist
// Pomodoro sessions) calls util.isDate() / util.isRegExp() in lib/model.js and
// lib/datastore.js. Those functions were deprecated in Node 4 and removed in Node 22,
// so on Node 22+ every nedb insert/find throws
// "TypeError: util.isDate is not a function" and the affected Jest suites fail.
//
// This file is loaded through jest.config.js `setupFiles`, i.e. before the test
// framework and before nedb is required. Jest's runtime hands out the same core `util`
// object to every module, so patching it here is enough for nedb. It only adds
// properties that are missing, so it is a no-op on older Node versions and can be
// dropped once nedb is replaced by a maintained fork (e.g. @seald-io/nedb).
//
// Production code is unaffected: Electron 14 embeds Node 14, where these helpers
// still exist, and this file is never bundled by webpack.
'use strict';

const util = require('util');

function isBufferLike(value) {
    return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

// Name -> implementation. Only entries missing on the running Node are defined.
const legacyTypeChecks = {
    isDate: (value) => Object.prototype.toString.call(value) === '[object Date]',
    isRegExp: (value) => Object.prototype.toString.call(value) === '[object RegExp]',
    isFunction: (value) => typeof value === 'function',
    isNumber: (value) => typeof value === 'number',
    isString: (value) => typeof value === 'string',
    isBoolean: (value) => typeof value === 'boolean',
    isNull: (value) => value === null,
    isUndefined: (value) => value === undefined,
    isSymbol: (value) => typeof value === 'symbol',
    isNullOrUndefined: (value) => value === null || value === undefined,
    isPrimitive: (value) =>
        value === null || (typeof value !== 'object' && typeof value !== 'function'),
    isBuffer: isBufferLike,
};

Object.keys(legacyTypeChecks).forEach((name) => {
    if (typeof util[name] !== 'function') {
        util[name] = legacyTypeChecks[name];
    }
});
