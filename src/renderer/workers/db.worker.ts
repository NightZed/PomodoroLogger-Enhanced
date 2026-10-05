import nedb from 'nedb';
import { addWorkerListeners, DoneType } from './util';
import { aggHistory } from '../../utils/aggPomodoro';
import { DeferredCompaction, deferCompaction } from './deferCompaction';
const ctx: Worker = self as any;
const dbs: { [name: string]: nedb } = {};
/** In-flight loads, keyed by path. */
const loading: { [name: string]: Promise<nedb> } = {};
const compactions = new WeakMap<nedb, DeferredCompaction>();

/** Open a handle whose load does not rewrite the file; see ./deferCompaction. */
function openDB(path: string): nedb {
    const db = new nedb({ filename: path });
    compactions.set(db, deferCompaction(db));
    return db;
}

export async function loadDB(path: string): Promise<nedb> {
    const db = openDB(path);
    return await new Promise((resolve, reject) => {
        let times = 0;
        const load = () => {
            db.loadDatabase((err) => {
                if (!err) {
                    resolve(db);
                    return;
                }

                times += 1;
                if (times > 10) {
                    reject(err);
                    return;
                }

                setTimeout(load, 100);
            });
        };

        load();
    });
}

/**
 * The single entry point every op goes through: the first caller loads the file
 * and everyone else waits for that same load. Handlers used to check
 * `if (!(path in dbs)) dbs[path] = await loadDB(path)` inline, and since `dbs`
 * was only written after that await, every request arriving during a load
 * started its own `loadDatabase()` on the same file.
 */
function getDB(path: string): Promise<nedb> {
    const loaded = dbs[path];
    if (loaded !== undefined) {
        return Promise.resolve(loaded);
    }

    const pending = loading[path];
    if (pending !== undefined) {
        return pending;
    }

    // Assigned synchronously right after the load is kicked off, so two
    // messages handled back to back can never both become "the first".
    const promise = loadDB(path).then(
        (db) => {
            delete loading[path];
            dbs[path] = db;
            compactions.get(db)?.compactOnce();
            return db;
        },
        (err) => {
            delete loading[path];
            throw err;
        }
    );
    loading[path] = promise;
    return promise;
}

function genHandleFunc(opName: string, leastArgNum: number = 0) {
    return async ({ args, path }: { args: any[]; path: string }, done: DoneType) => {
        if (leastArgNum > args.length) {
            throw new Error(
                `${opName} operation must have at least
                 ${leastArgNum} arguments but got ${args.length}`
            );
        }

        const db = await getDB(path);

        args.push((err: Error, doc: any) => {
            done({
                type: 'done',
                payload: doc,
            });
        });

        // @ts-ignore
        db[opName](...args);
    };
}

addWorkerListeners(ctx, {
    find: genHandleFunc('find', 2),
    findOne: genHandleFunc('findOne', 1),
    update: genHandleFunc('update', 2),
    insert: genHandleFunc('insert', 1),
    remove: genHandleFunc('remove', 1),
    count: genHandleFunc('count', 1),
    // History view aggregation: query + aggregate inside the worker, so raw
    // records (with their large apps/titleSpentTime dicts) never cross to the
    // main thread. Only the small aggregated result is transferred back.
    aggHistory: async (
        {
            path,
            kanbanPath,
            recentQuery,
            yearQuery,
            periodRange,
        }: {
            path: string;
            kanbanPath: string;
            recentQuery?: any;
            yearQuery: any;
            periodRange?: { from: number; to: number };
        },
        done: DoneType
    ) => {
        const [db, kanban] = await Promise.all([getDB(path), getDB(kanbanPath)]);
        const findAsync = (db: nedb, query: any, proj: any): Promise<any[]> =>
            new Promise((resolve, reject) => {
                // Projection: only fields the aggregation needs, to shrink the
                // working set the worker has to traverse.
                // @ts-ignore
                db.find(query, proj, (err: Error | null, docs: any[]) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(docs);
                });
            });

        // Resolve project names from the kanban DB directly in the worker (it is
        // just another nedb file). Reading the whole board table here is what
        // keeps `state.kanban.boards` out of the History effect's dependencies:
        // renaming or loading a board no longer re-runs the aggregation, and the
        // names can never be stale.
        const boardNames: { [boardId: string]: string } = {};
        for (const board of await findAsync(kanban, {}, { _id: 1, name: 1 })) {
            boardNames[board._id] = board.name;
        }

        // Errors propagate to addWorkerListeners, which reports them back with
        // the request code so the main-thread promise rejects promptly.
        // A single year query serves both halves: the calendar keeps the whole
        // year, and `aggHistory` slices the chosen month out of the same records
        // for the badge/charts instead of paying for a second find.
        const [recentRecords, yearRecords] = await Promise.all([
            recentQuery ? findAsync(db, recentQuery, projection) : Promise.resolve(undefined),
            findAsync(db, yearQuery, projection),
        ]);
        done({
            type: 'done',
            payload: aggHistory(recentRecords ?? yearRecords, yearRecords, boardNames, periodRange),
        });
    },
});

const projection: any = {
    startTime: 1,
    spentTimeInHour: 1,
    boardId: 1,
    apps: 1,
};
