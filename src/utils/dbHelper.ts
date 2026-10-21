import type { DbRepository } from '../main/db/types';

/**
 * Thin async facade over a repository.
 *
 * The class name is kept because action modules and tests already use it. The
 * NeDB callback plumbing is gone: repositories return promises, and the main
 * process owns the only SQLite connection.
 */
export class AsyncDB {
    constructor(private db: DbRepository) {}

    async find(query?: any, projection?: any): Promise<any> {
        return await this.db.find(query, projection);
    }

    async update(query: any, updateQuery: any, options: any = {}) {
        return await this.db.update(query, updateQuery, options);
    }

    async findOne(query?: any, projection?: any): Promise<any> {
        return await this.db.findOne(query, projection);
    }

    async count(query?: any) {
        return await this.db.count(query);
    }

    async insert(docs: any) {
        return await this.db.insert(docs);
    }

    async remove(query?: any, options?: any) {
        return await this.db.remove(query, options);
    }

    async getAll(): Promise<any> {
        return await this.db.find({});
    }
}
