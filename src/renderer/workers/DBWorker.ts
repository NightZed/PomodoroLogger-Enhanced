import { dbs } from '../dbs';
import type { DbName, HistoryArg } from '../../main/db/types';

/**
 * Compatibility facade for the call sites that used to talk to the NeDB web
 * worker. The name and method signatures are unchanged; the actual work now
 * happens in the main process (or in the in-memory repositories under Jest).
 */
export class DBWorker {
    constructor(private readonly dbType: DbName) {}

    getWorker() {
        return undefined;
    }

    setWorker(_worker: unknown) {
        // No per-worker connection exists any more.
    }

    find = (query?: any, projection?: any) => dbs[this.dbType].find(query, projection);
    findOne = (query?: any, projection?: any) => dbs[this.dbType].findOne(query, projection);
    insert = (docs: any) => dbs[this.dbType].insert(docs);
    update = (query: any, update: any, options?: any) =>
        dbs[this.dbType].update(query, update, options);
    remove = (query?: any, options?: any) => dbs[this.dbType].remove(query, options);
    count = (query?: any) => dbs[this.dbType].count(query);

    aggHistory = async (arg: HistoryArg): Promise<any> => {
        const repository = dbs[this.dbType] as any;
        if (typeof repository.aggHistory !== 'function') {
            throw new Error(`aggHistory is not supported by ${this.dbType}`);
        }
        return repository.aggHistory(arg);
    };
}
