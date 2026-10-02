import nedb from 'nedb';
import { dbPaths } from '../../config';
import { deferCompaction } from './deferCompaction';

describe('deferCompaction', () => {
    it('keeps the load read-only and queues exactly one compaction afterwards', async () => {
        const db = new nedb({ filename: dbPaths.kanbanDB, autoload: false });
        const persistence = (db as any).persistence;
        let rewrites = 0;
        const original = persistence.persistCachedDatabase.bind(persistence);
        persistence.persistCachedDatabase = ((cb?: any) => {
            rewrites += 1;
            original(cb);
        }) as any;

        const compaction = deferCompaction(db, 0);
        await new Promise<void>((resolve, reject) => {
            db.loadDatabase((err) => (err ? reject(err) : resolve()));
        });

        // The regression this guards: neDB rewrites the whole file inside
        // loadDatabase(), which is what used to blow the request budgets of a
        // fresh start (and made two loads of one file fight over its temp file).
        expect(rewrites).toBe(0);

        compaction.compactOnce();
        compaction.compactOnce();
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Still compacted once per start, just no longer on the query's path.
        expect(rewrites).toBe(1);
    });
});
