import { openSqlite } from './connection';
import { cardSpec, createSchema, listSpec, moveSpec } from './schema';
import { SettingsRepository, SqliteRepository } from './repository';

const setup = () => {
    const connection = openSqlite(':memory:');
    createSchema(connection);
    return {
        connection,
        cards: new SqliteRepository(connection, cardSpec),
        lists: new SqliteRepository(connection, listSpec),
        moves: new SqliteRepository(connection, moveSpec),
        settings: new SettingsRepository(connection),
    };
};

describe('SQLite repository query/update mapping', () => {
    it('supports equality, comparison and $in queries plus projection', async () => {
        const { connection, cards } = setup();
        try {
            await cards.insert([
                {
                    _id: 'a',
                    title: 'Alpha',
                    sessionIds: ['s1'],
                    spentTimeInHour: { estimated: 1, actual: 2 },
                    createdTime: 100,
                },
                {
                    _id: 'b',
                    title: 'Beta',
                    sessionIds: [],
                    spentTimeInHour: { estimated: 3, actual: 4 },
                    createdTime: 200,
                },
                {
                    _id: 'c',
                    title: 'Gamma',
                    sessionIds: [],
                    spentTimeInHour: { estimated: 5, actual: 6 },
                    createdTime: 300,
                },
            ]);

            expect((await cards.find({ _id: 'b' })).map((card: any) => card.title)).toEqual([
                'Beta',
            ]);
            expect(
                (await cards.find({ createdTime: { $gte: 150, $lt: 300 } })).map(
                    (card: any) => card._id
                )
            ).toEqual(['b']);
            expect(
                (await cards.find({ _id: { $in: ['a', 'c'] } })).map((card: any) => card._id)
            ).toEqual(['a', 'c']);
            expect(await cards.find({}, { _id: 1, title: 1 })).toEqual([
                { _id: 'a', title: 'Alpha' },
                { _id: 'b', title: 'Beta' },
                { _id: 'c', title: 'Gamma' },
            ]);
            expect(await cards.count({ sessionIds: { $exists: true } })).toBe(3);
        } finally {
            connection.close();
        }
    });

    it('applies $set, dot paths, $unset, $inc, $push and $pull', async () => {
        const { connection, cards } = setup();
        try {
            await cards.insert({
                _id: 'a',
                title: 'Alpha',
                sessionIds: [],
                spentTimeInHour: { estimated: 1, actual: 2 },
            });

            await cards.update(
                { _id: 'a' },
                {
                    $set: { 'spentTimeInHour.actual': 10, labels: [{ name: 'x' }] },
                    $push: { sessionIds: 's1' },
                    $inc: { 'spentTimeInHour.estimated': 2 },
                }
            );
            let card: any = await cards.findOne({ _id: 'a' });
            expect(card.spentTimeInHour).toEqual({ estimated: 3, actual: 10 });
            expect(card.sessionIds).toEqual(['s1']);
            expect(card.labels).toEqual([{ name: 'x' }]);

            await cards.update({ _id: 'a' }, { $pull: { sessionIds: 's1' } });
            await cards.update({ _id: 'a' }, { $unset: { labels: true } });
            card = await cards.findOne({ _id: 'a' });
            expect(card.sessionIds).toEqual([]);
            expect(card).not.toHaveProperty('labels');
        } finally {
            connection.close();
        }
    });

    it('supports upsert and multi updates/removes', async () => {
        const { connection, cards } = setup();
        try {
            await cards.update(
                { _id: 'new' },
                { $set: { title: 'Created by upsert', sessionIds: [] } },
                { upsert: true }
            );
            expect((await cards.findOne({ _id: 'new' }))?.title).toBe('Created by upsert');

            await cards.insert([
                { _id: 'a', title: 'A', sessionIds: [], spentTimeInHour: { estimated: 0 } },
                { _id: 'b', title: 'B', sessionIds: [], spentTimeInHour: { estimated: 0 } },
            ]);
            expect(await cards.update({}, { $set: { completedTime: 5 } })).toBe(1);
            expect(await cards.update({}, { $set: { completedTime: 6 } }, { multi: true })).toBe(3);
            expect(await cards.count({ completedTime: 6 })).toBe(3);

            expect(await cards.remove({}, { multi: true })).toBe(3);
            expect(await cards.count({})).toBe(0);
        } finally {
            connection.close();
        }
    });

    it('keeps unknown fields and exposes only the document, not storage columns', async () => {
        const { connection, cards } = setup();
        try {
            await cards.insert({
                _id: 'a',
                title: 'A',
                sessionIds: [],
                spentTimeInHour: { estimated: 0, actual: 0 },
                futureField: { nested: true },
            });
            expect(await cards.findOne({ _id: 'a' })).toEqual({
                _id: 'a',
                title: 'A',
                sessionIds: [],
                spentTimeInHour: { estimated: 0, actual: 0 },
                futureField: { nested: true },
            });
        } finally {
            connection.close();
        }
    });

    it('keeps list order and move history', async () => {
        const { connection, lists, moves } = setup();
        try {
            await lists.insert({ _id: 'l', title: 'L', cards: ['c2', 'c1'] });
            expect((await lists.findOne({ _id: 'l' }))?.cards).toEqual(['c2', 'c1']);

            await moves.insert([
                { fromListId: 'a', toListId: 'b', cardId: 'c', time: 1 },
                { fromListId: 'b', toListId: 'a', cardId: 'c', time: 2 },
            ]);
            expect(await moves.find({ cardId: 'c' })).toHaveLength(2);
            expect(await moves.count({ time: { $gt: 1 } })).toBe(1);
        } finally {
            connection.close();
        }
    });

    it('stores settings as key-value rows and keeps unknown keys', async () => {
        const { connection, settings } = setup();
        try {
            await settings.update(
                { name: 'setting' },
                { $set: { themeId: 'dark', customThemes: [{ id: 'x' }], future: 1 } },
                { upsert: true }
            );
            expect(await settings.findOne({ name: 'setting' })).toEqual({
                name: 'setting',
                themeId: 'dark',
                customThemes: [{ id: 'x' }],
                future: 1,
            });
            expect(settings.getValueSync('themeId')).toBe('dark');
            const rows = connection.prepare('SELECT key FROM settings ORDER BY key').all();
            expect(rows.map((row: any) => row.key)).toEqual([
                'customThemes',
                'future',
                'name',
                'themeId',
            ]);
        } finally {
            connection.close();
        }
    });
});
