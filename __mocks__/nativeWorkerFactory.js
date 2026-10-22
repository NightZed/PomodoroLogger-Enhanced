const Worker = require('./workerMock');

// Keep Jest away from `import.meta.url` in nativeWorkerFactory.ts. The real
// module is only used by webpack's worker-chunk parser.
module.exports = {
    createTokenizerWorker: () => new Worker(),
    createKnnWorker: () => new Worker(),
};
