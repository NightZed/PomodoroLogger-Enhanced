/**
 * Define All Web Workers
 *
 * The database worker is gone: the renderer reaches the main-process SQLite
 * repositories through `dbs`. The tokenizer and KNN workers remain real web
 * workers.
 */

import { KnnWorker } from './knnWorker';
import { Tokenizer } from './tokenizer';
import { DBWorker } from './DBWorker';
import { dbNames, DbName } from '../../main/db/types';

const dbWorkers = Object.fromEntries(dbNames.map((name) => [name, new DBWorker(name)])) as {
    [name in DbName]: DBWorker;
};

function initWorkers() {
    // Kept for callers that used to restart the db worker after refreshing the
    // remote handles. The SQLite repositories do not hold per-worker state.
}

export const restartDBWorkers = initWorkers;
export const workers = {
    dbWorkers,
    knn: new KnnWorker(),
    tokenizer: new Tokenizer(),
};
