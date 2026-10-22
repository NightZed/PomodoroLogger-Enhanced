/**
 * Native webpack 5 worker entry points.
 *
 * The `new Worker(new URL(..., import.meta.url))` form tells webpack to emit
 * each worker as its own chunk. Keeping this in a separate module keeps the
 * `import.meta` syntax out of the Jest graph: `jest.config.js` maps this module
 * to a small worker mock, just like the old `worker-loader!` mapper did.
 */
export const createTokenizerWorker = () =>
    new Worker(new URL('./tokenizer.worker.ts', import.meta.url));

export const createKnnWorker = () => new Worker(new URL('./trainKnn.worker.ts', import.meta.url));
