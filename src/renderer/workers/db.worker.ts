import nedb from 'nedb';
import { addWorkerListeners, DoneType } from './util';
import { aggHistory } from '../../utils/aggPomodoro';
const ctx: Worker = self as any;
const dbs: { [name: string]: nedb } = {};

export async function loadDB(path: string): Promise<nedb> {
    const db = new nedb({ filename: path });
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

function genHandleFunc(opName: string, leastArgNum: number = 0) {
    return async ({ args, path }: { args: any[]; path: string }, done: DoneType) => {
        if (leastArgNum > args.length) {
            throw new Error(
                `${opName} operation must have at least
                 ${leastArgNum} arguments but got ${args.length}`
            );
        }

        if (!(path in dbs)) {
            dbs[path] = await loadDB(path);
        }

        args.push((err: Error, doc: any) => {
            done({
                type: 'done',
                payload: doc,
            });
        });

        // @ts-ignore
        dbs[path][opName](...args);
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
            boardIds,
            recentQuery,
            yearQuery,
        }: {
            path: string;
            kanbanPath: string;
            boardIds: string[];
            recentQuery?: any;
            yearQuery: any;
        },
        done: DoneType
    ) => {
        if (!(path in dbs)) {
            dbs[path] = await loadDB(path);
        }
        const db = dbs[path];
        // Resolve project names directly in the worker (kanban DB is just
        // another nedb file) to avoid round trips to the main thread.
        if (!(kanbanPath in dbs)) {
            dbs[kanbanPath] = await loadDB(kanbanPath);
        }
        const kanban = dbs[kanbanPath];
        const findOneAsync = (query: any): Promise<any> =>
            new Promise((resolve, reject) =>
                kanban.findOne(query, (err: Error | null, doc: any) =>
                    err ? reject(err) : resolve(doc)
                )
            );
        const boardNames: { [boardId: string]: string } = {};
        for (const boardId of boardIds) {
            const board = await findOneAsync({ _id: boardId });
            boardNames[boardId] = board ? board.name : 'Unknown';
        }

        const findAsync = (query: any): Promise<any[]> =>
            new Promise((resolve, reject) => {
                // Projection: only fields the aggregation needs, to shrink the
                // working set the worker has to traverse.
                db.find(query, projection, (err: Error | null, docs: any[]) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(docs);
                });
            });

        // Errors propagate to addWorkerListeners, which reports them back with
        // the request code so the main-thread promise rejects promptly.
        const [recentRecords, yearRecords] = await Promise.all([
            recentQuery ? findAsync(recentQuery) : Promise.resolve(undefined),
            findAsync(yearQuery),
        ]);
        done({
            type: 'done',
            payload: aggHistory(recentRecords ?? yearRecords, yearRecords, boardNames),
        });
    },
});

const projection: any = {
    startTime: 1,
    spentTimeInHour: 1,
    boardId: 1,
    apps: 1,
};
