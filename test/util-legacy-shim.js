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

// Jest only defaults NODE_ENV to 'test' when it is not already defined in the
// outer shell. When a developer's environment exports NODE_ENV=development
// (or anything else), test-only branches guarded by
// `process.env.NODE_ENV === 'test'` (FakeDBWorker, in-memory db paths, ...)
// silently turn off and the suites exercise the production code paths instead.
// setupFiles run before any test module is loaded, so pin it here.
process.env.NODE_ENV = 'test';

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
