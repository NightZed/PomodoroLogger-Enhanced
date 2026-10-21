import type { Database } from 'better-sqlite3';
import { uid } from '../../utils/uid';
import type {
    DbRepository,
    HistoryArg,
    RemoveOptions,
    SessionRepository,
    UpdateOptions,
} from './types';
import type { FieldSpec, TableSpec } from './schema';

const hasOwn = (value: any, key: string) =>
    value != null && Object.prototype.hasOwnProperty.call(value, key);

/**
 * Documents are JSON-shaped, and jsdom does not expose Node's structuredClone
 * in every supported runtime. JSON round-tripping is the portable equivalent
 * here and also matches what actually reaches SQLite.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function getPath(doc: any, path: string): any {
    return path.split('.').reduce((value, part) => (value == null ? undefined : value[part]), doc);
}

function setPath(doc: any, path: string, value: any) {
    const parts = path.split('.');
    let cursor = doc;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (cursor[part] == null || typeof cursor[part] !== 'object') {
            cursor[part] = {};
        }
        cursor = cursor[part];
    }
    cursor[parts[parts.length - 1]] = value;
}

function deletePath(doc: any, path: string) {
    const parts = path.split('.');
    let cursor = doc;
    for (let i = 0; i < parts.length - 1; i += 1) {
        cursor = cursor?.[parts[i]];
        if (cursor == null) {
            return;
        }
    }
    delete cursor[parts[parts.length - 1]];
}

/** Recursively compare the JSON-shaped values NeDB queries were used with. */
function equals(actual: any, expected: any): boolean {
    if (actual === expected) {
        return true;
    }
    if (actual == null || expected == null) {
        return actual == null && expected == null;
    }
    if (Array.isArray(actual) && Array.isArray(expected)) {
        return (
            actual.length === expected.length &&
            actual.every((value, index) => equals(value, expected[index]))
        );
    }
    if (typeof actual === 'object' && typeof expected === 'object') {
        const actualKeys = Object.keys(actual);
        const expectedKeys = Object.keys(expected);
        return (
            actualKeys.length === expectedKeys.length &&
            expectedKeys.every((key) => hasOwn(actual, key) && equals(actual[key], expected[key]))
        );
    }
    return false;
}

function matchesOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
        case '$eq':
            return equals(actual, expected);
        case '$ne':
            return !equals(actual, expected);
        case '$gt':
            return actual != null && actual > expected;
        case '$gte':
            return actual != null && actual >= expected;
        case '$lt':
            return actual != null && actual < expected;
        case '$lte':
            return actual != null && actual <= expected;
        case '$in':
            return Array.isArray(expected) && expected.some((value) => equals(actual, value));
        case '$nin':
            return Array.isArray(expected) && !expected.some((value) => equals(actual, value));
        case '$exists':
            return expected ? actual !== undefined : actual === undefined;
        case '$regex': {
            const regex = expected instanceof RegExp ? expected : new RegExp(String(expected));
            return typeof actual === 'string' && regex.test(actual);
        }
        default:
            throw new Error(`Unsupported query operator: ${operator}`);
    }
}

export function matchesQuery(doc: any, query: any): boolean {
    if (query == null) {
        return true;
    }
    if (typeof query !== 'object' || Array.isArray(query)) {
        throw new Error('Database query must be an object');
    }

    return Object.keys(query).every((key) => {
        if (key === '$and') {
            return (
                Array.isArray(query[key]) &&
                query[key].every((part: any) => matchesQuery(doc, part))
            );
        }
        if (key === '$or') {
            return (
                Array.isArray(query[key]) && query[key].some((part: any) => matchesQuery(doc, part))
            );
        }

        const actual = getPath(doc, key);
        const expected = query[key];
        if (
            expected != null &&
            typeof expected === 'object' &&
            !Array.isArray(expected) &&
            !(expected instanceof Date) &&
            Object.keys(expected).some((operator) => operator.startsWith('$'))
        ) {
            return Object.keys(expected).every((operator) =>
                matchesOperator(actual, operator, expected[operator])
            );
        }

        return equals(actual, expected);
    });
}

export function applyProjection(doc: any, projection?: any): any {
    if (doc == null || projection == null) {
        return doc;
    }
    const keys = Object.keys(projection);
    if (keys.length === 0) {
        return doc;
    }

    const include = keys.some((key) => key !== '_id' && !!projection[key]);
    if (!include) {
        const result = { ...doc };
        for (const key of keys) {
            if (!projection[key]) {
                delete result[key];
            }
        }
        return result;
    }

    const result: any = {};
    for (const key of keys) {
        if (key === '_id') {
            if (projection[key]) {
                result._id = doc._id;
            }
            continue;
        }

        if (projection[key]) {
            const value = getPath(doc, key);
            if (value !== undefined) {
                setPath(result, key, value);
            }
        }
    }
    return result;
}

function applyUpdate(doc: any, update: any, isInsert: boolean): any {
    if (update == null || typeof update !== 'object') {
        throw new Error('Database update must be an object');
    }

    const keys = Object.keys(update);
    const hasOperator = keys.some((key) => key.startsWith('$'));
    if (!hasOperator) {
        // NeDB's replacement form. Keep `_id` because it is the identity even
        // when the caller omitted it from the replacement document.
        const replacement = clone(update);
        if (doc._id !== undefined) {
            replacement._id = doc._id;
        }
        return replacement;
    }

    const next = clone(doc);
    for (const operator of keys) {
        const changes = update[operator];
        if (changes == null || typeof changes !== 'object') {
            throw new Error(`Update operator ${operator} requires an object`);
        }

        switch (operator) {
            case '$set':
                for (const path of Object.keys(changes)) {
                    setPath(next, path, changes[path]);
                }
                break;
            case '$setOnInsert':
                if (isInsert) {
                    for (const path of Object.keys(changes)) {
                        setPath(next, path, changes[path]);
                    }
                }
                break;
            case '$unset':
                for (const path of Object.keys(changes)) {
                    deletePath(next, path);
                }
                break;
            case '$inc':
                for (const path of Object.keys(changes)) {
                    const current = getPath(next, path);
                    setPath(
                        next,
                        path,
                        (typeof current === 'number' ? current : 0) + changes[path]
                    );
                }
                break;
            case '$push':
                for (const path of Object.keys(changes)) {
                    const current = getPath(next, path);
                    const list = Array.isArray(current) ? current : [];
                    const value = changes[path];
                    if (value && typeof value === 'object' && Array.isArray(value.$each)) {
                        list.push(...value.$each);
                    } else {
                        list.push(value);
                    }
                    setPath(next, path, list);
                }
                break;
            case '$pull':
                for (const path of Object.keys(changes)) {
                    const current = getPath(next, path);
                    if (!Array.isArray(current)) {
                        continue;
                    }
                    const condition = changes[path];
                    const predicate =
                        condition != null &&
                        typeof condition === 'object' &&
                        !Array.isArray(condition) &&
                        Object.keys(condition).some((key) => key.startsWith('$'))
                            ? (value: any) => matchesQuery({ value }, { value: condition })
                            : (value: any) => equals(value, condition);
                    setPath(
                        next,
                        path,
                        current.filter((value) => !predicate(value))
                    );
                }
                break;
            default:
                throw new Error(`Unsupported update operator: ${operator}`);
        }
    }
    return next;
}

function serialize(value: any, kind: FieldSpec['kind']): any {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return null;
    }
    switch (kind) {
        case 'boolean':
            return value ? 1 : 0;
        case 'json':
            return JSON.stringify(value);
        default:
            return value;
    }
}

function rowColumns(spec: TableSpec, doc: any): any[] {
    return spec.fields.map((field) => {
        const value = getPath(doc, field.path);
        return serialize(value === undefined ? field.fallback : value, field.kind);
    });
}

interface RowRecord {
    row: any;
    doc: any;
}

export class SqliteRepository<T = any> implements DbRepository<T> {
    constructor(protected readonly db: Database, protected readonly spec: TableSpec) {}

    private selectRows(): RowRecord[] {
        const rows = this.db
            .prepare(`SELECT rowid AS _rowid, * FROM ${this.spec.table}`)
            .all() as any[];
        return rows.map((row) => ({
            row,
            doc: row.doc != null ? JSON.parse(row.doc) : this.docFromColumns(row),
        }));
    }

    private docFromColumns(row: any): any {
        const doc: any = {};
        if (this.spec.hasId) {
            doc._id = row._id;
        }
        for (const field of this.spec.fields) {
            let value = row[field.column];
            if (value == null) {
                continue;
            }
            if (field.kind === 'json') {
                try {
                    value = JSON.parse(value);
                } catch {
                    value = field.fallback;
                }
            } else if (field.kind === 'boolean') {
                value = !!value;
            }
            setPath(doc, field.path, value);
        }
        return doc;
    }

    private write(row: any, doc: any) {
        const assignments = this.spec.fields.map((field) => `${field.column} = ?`).join(', ');
        const values = rowColumns(this.spec, doc);
        if (this.spec.hasId) {
            this.db
                .prepare(`UPDATE ${this.spec.table} SET ${assignments}, doc = ? WHERE _id = ?`)
                .run(...values, JSON.stringify(doc), doc._id);
        } else {
            this.db
                .prepare(`UPDATE ${this.spec.table} SET ${assignments}, doc = ? WHERE rowid = ?`)
                .run(...values, JSON.stringify(doc), row._rowid);
        }
    }

    private insertOne(doc: any): any {
        if (this.spec.hasId && doc._id === undefined) {
            doc._id = uid();
        }

        if (this.spec.hasId) {
            const columns = ['_id', ...this.spec.fields.map((field) => field.column), 'doc'];
            const placeholders = columns.map(() => '?').join(', ');
            this.db
                .prepare(
                    `INSERT INTO ${this.spec.table} (${columns.join(
                        ', '
                    )}) VALUES (${placeholders})`
                )
                .run(doc._id, ...rowColumns(this.spec, doc), JSON.stringify(doc));
            return doc;
        }

        const columns = [...this.spec.fields.map((field) => field.column), 'doc'];
        const placeholders = columns.map(() => '?').join(', ');
        this.db
            .prepare(
                `INSERT INTO ${this.spec.table} (${columns.join(', ')}) VALUES (${placeholders})`
            )
            .run(...rowColumns(this.spec, doc), JSON.stringify(doc));
        return doc;
    }

    async find<R = T>(query: any = {}, projection?: any): Promise<R[]> {
        return this.selectRows()
            .map(({ doc }) => doc)
            .filter((doc) => matchesQuery(doc, query))
            .map((doc) => applyProjection(doc, projection)) as R[];
    }

    async findOne<R = T>(query: any = {}, projection?: any): Promise<R | null> {
        const found = this.selectRows().find(({ doc }) => matchesQuery(doc, query));
        return found ? (applyProjection(found.doc, projection) as R) : null;
    }

    insertSync<R = T>(docs: R | R[]): R | R[] {
        const list = Array.isArray(docs) ? docs : [docs];
        const inserted = this.db.transaction(() => list.map((doc) => this.insertOne(doc as any)))();
        return Array.isArray(docs) ? (inserted as R[]) : (inserted[0] as R);
    }

    async insert<R = T>(docs: R | R[]): Promise<R | R[]> {
        return this.insertSync(docs);
    }

    /** Used by the import flow, which owns the surrounding transaction. */
    clearSync() {
        this.db.prepare(`DELETE FROM ${this.spec.table}`).run();
    }

    async update(query: any, update: any, options: UpdateOptions = {}): Promise<number> {
        const matches = this.selectRows().filter(({ doc }) => matchesQuery(doc, query));
        if (matches.length === 0) {
            if (!options.upsert) {
                return 0;
            }

            const base: any = { _id: query?._id ?? uid() };
            if (query != null) {
                for (const key of Object.keys(query)) {
                    const value = query[key];
                    if (
                        key !== '_id' &&
                        !key.startsWith('$') &&
                        (value == null ||
                            typeof value !== 'object' ||
                            !Object.keys(value).some((part) => part.startsWith('$')))
                    ) {
                        base[key] = value;
                    }
                }
            }
            const doc = applyUpdate(base, update, true);
            this.insertOne(doc);
            return 1;
        }

        const targets = options.multi ? matches : matches.slice(0, 1);
        this.db.transaction(() => {
            for (const target of targets) {
                this.write(target.row, applyUpdate(target.doc, update, false));
            }
        })();
        return targets.length;
    }

    async remove(query: any = {}, options: RemoveOptions = {}): Promise<number> {
        const matches = this.selectRows().filter(({ doc }) => matchesQuery(doc, query));
        const targets = options.multi ? matches : matches.slice(0, 1);
        if (targets.length === 0) {
            return 0;
        }

        this.db.transaction(() => {
            const statement = this.spec.hasId
                ? this.db.prepare(`DELETE FROM ${this.spec.table} WHERE _id = ?`)
                : this.db.prepare(`DELETE FROM ${this.spec.table} WHERE rowid = ?`);
            for (const target of targets) {
                statement.run(this.spec.hasId ? target.doc._id : target.row._rowid);
            }
        })();
        return targets.length;
    }

    async count(query: any = {}): Promise<number> {
        return this.selectRows().filter(({ doc }) => matchesQuery(doc, query)).length;
    }
}

export class SettingsRepository implements DbRepository {
    constructor(private readonly db: Database) {}

    getAllSync(): Record<string, any> {
        const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
            key: string;
            value: string;
        }[];
        if (rows.length === 0) {
            return {};
        }

        const doc: any = { name: 'setting' };
        for (const row of rows) {
            try {
                doc[row.key] = JSON.parse(row.value);
            } catch {
                doc[row.key] = row.value;
            }
        }
        return doc;
    }

    getValueSync(key: string): any {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
            | { value: string }
            | undefined;
        if (!row) {
            return undefined;
        }
        try {
            return JSON.parse(row.value);
        } catch {
            return row.value;
        }
    }

    private write(doc: any) {
        this.db.transaction(() => {
            this.db.prepare('DELETE FROM settings').run();
            const insert = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
            for (const key of Object.keys(doc)) {
                if (key === '_id') {
                    continue;
                }
                insert.run(key, JSON.stringify(doc[key]));
            }
        })();
    }

    async find(query: any = {}, projection?: any): Promise<any[]> {
        const doc = this.getAllSync();
        if (!doc.name || !matchesQuery(doc, query)) {
            return [];
        }
        return [applyProjection(doc, projection)];
    }

    async findOne(query: any = {}, projection?: any): Promise<any | null> {
        return (await this.find(query, projection))[0] ?? null;
    }

    async insert(docs: any | any[]): Promise<any | any[]> {
        const list = Array.isArray(docs) ? docs : [docs];
        const doc = this.getAllSync();
        for (const item of list) {
            for (const key of Object.keys(item)) {
                if (key !== '_id') {
                    doc[key] = item[key];
                }
            }
        }
        doc.name = 'setting';
        this.write(doc);
        return docs;
    }

    async update(query: any, update: any, options: UpdateOptions = {}): Promise<number> {
        const current = this.getAllSync();
        const exists = current.name && matchesQuery(current, query);
        if (!exists && !options.upsert) {
            return 0;
        }
        const base = exists ? current : { name: 'setting' };
        const next = applyUpdate(base, update, !exists);
        next.name = 'setting';
        this.write(next);
        return 1;
    }

    async remove(query: any = {}, _options: RemoveOptions = {}): Promise<number> {
        const current = this.getAllSync();
        if (!current.name || !matchesQuery(current, query)) {
            return 0;
        }
        this.db.prepare('DELETE FROM settings').run();
        return 1;
    }

    async count(query: any = {}): Promise<number> {
        return (await this.find(query)).length;
    }
}

export function createSessionRepository(
    db: Database,
    base: SqliteRepository,
    aggregate: (
        arg: HistoryArg,
        recentRecords: any[] | undefined,
        yearRecords: any[],
        boards: any[]
    ) => any
): SessionRepository {
    const historyProjection = {
        startTime: 1,
        spentTimeInHour: 1,
        boardId: 1,
        apps: 1,
    };
    return Object.assign(base, {
        async aggHistory(arg: HistoryArg) {
            const [recentRecords, yearRecords, boards] = await Promise.all([
                arg.recentQuery
                    ? base.find(arg.recentQuery, historyProjection)
                    : Promise.resolve(undefined),
                base.find(arg.yearQuery, historyProjection),
                // The board table is tiny; reading it here keeps History from
                // depending on the renderer's board state and stale names.
                (db.prepare('SELECT doc FROM boards').all() as { doc: string }[]).map((row) =>
                    JSON.parse(row.doc)
                ),
            ]);
            return aggregate(arg, recentRecords, yearRecords, boards);
        },
    }) as SessionRepository;
}
