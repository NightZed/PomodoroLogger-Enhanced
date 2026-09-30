import nedb from 'nedb';

/**
 * neDB 1.8 compatibility helper.
 *
 * neDB rewrites the whole data file inside `loadDatabase()`: "all data is
 * persisted right away, which has the effect of compacting the database file"
 * (nedb/lib/persistence.js). For the multi-MB session DB that turns every load
 * into read + reserialize + write + rename, and two loads of the same file race
 * over the single `<file>~` temp file -- which is what made a fresh start miss
 * its request timeouts.
 *
 * `deferCompaction` keeps the load read-only and lets the caller queue the same
 * one compaction afterwards, so the file is still compacted once per start but
 * no query has to wait for the write. Crash safety is unaffected: neDB's
 * `ensureDatafileIntegrity` still recovers from a leftover `<file>~`.
 */

/** Delay before the queued compaction runs, so a start's first queries land first. */
export const DEFAULT_COMPACT_DELAY = 1000;

export interface DeferredCompaction {
    /** Queue the one compaction; safe to call more than once. */
    compactOnce: () => void;
}

export function deferCompaction(
    db: nedb,
    delay: number = DEFAULT_COMPACT_DELAY
): DeferredCompaction {
    const persistence = (db as any).persistence;
    const persist = persistence.persistCachedDatabase.bind(persistence);
    let queued = false;
    persistence.persistCachedDatabase = (cb?: (err?: Error | null) => void) => {
        if (cb) {
            cb(null);
        }
    };

    return {
        compactOnce: () => {
            if (queued) {
                return;
            }

            queued = true;
            // `compactDatafile` resolves `this.persistCachedDatabase`, so the
            // original has to be back in place before it is called.
            persistence.persistCachedDatabase = persist;
            setTimeout(() => persistence.compactDatafile(), delay);
        },
    };
}
