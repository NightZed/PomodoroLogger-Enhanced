import { AsyncDB } from './dbHelper';
import { openSqlite } from '../main/db/connection';
import { cardSpec, createSchema } from '../main/db/schema';
import { SqliteRepository } from '../main/db/repository';

const createDb = () => {
    const connection = openSqlite(':memory:');
    createSchema(connection);
    return {
        connection,
        db: new AsyncDB(new SqliteRepository(connection, cardSpec)),
    };
};

describe('AsyncDB', () => {
    it('should update, insert, find, findOne', async () => {
        const { connection, db } = createDb();
        try {
            expect(await db.find({})).toStrictEqual([]);
            await db.insert({ _id: 'zizi' });
            expect(await db.find({})).toStrictEqual([{ _id: 'zizi' }]);
            await db.update({ _id: 'zizi' }, { $set: { lala: 12 } });
            expect(await db.find({})).toStrictEqual([{ _id: 'zizi', lala: 12 }]);
            expect(await db.findOne({})).toStrictEqual({ _id: 'zizi', lala: 12 });
            await db.insert({ _id: '11' });
            await db.remove({ _id: 'zizi' });
            expect(await db.find({})).toStrictEqual([{ _id: '11' }]);
        } finally {
            connection.close();
        }
    });

    it('should count', async () => {
        const { connection, db } = createDb();
        try {
            await db.insert({ _id: 'zizi' });
            await db.insert({ _id: '11' });
            expect(await db.count({})).toBe(2);
        } finally {
            connection.close();
        }
    });
});
