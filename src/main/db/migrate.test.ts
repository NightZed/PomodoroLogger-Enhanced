import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openSqlite } from './connection';
import { migrateNedbToSqlite } from './migrate';
import { getUserVersion } from './schema';

const line = (value: any) => JSON.stringify(value) + '\n';

describe('NeDB -> SQLite migration', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'pomodoro-migrate-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('imports every collection, keeps _ids/unknown fields and skips a partial last line', () => {
        const legacy = {
            sessionDB: join(root, 'session.nedb'),
            settingDB: join(root, 'setting.nedb'),
            kanbanDB: join(root, 'kanban.nedb'),
            cardsDB: join(root, 'cards.nedb'),
            listsDB: join(root, 'lists.nedb'),
            moveDB: join(root, 'moveCard.nedb'),
        };
        writeFileSync(
            legacy.sessionDB,
            line({
                _id: 'session-1',
                startTime: 10,
                spentTimeInHour: 1.5,
                switchTimes: 2,
                apps: { Chrome: { spentTimeInHour: 1.5, titleSpentTime: {} } },
                unknownSessionField: 'keep-me',
            }) +
                '\n' +
                line({
                    _id: 'session-2',
                    startTime: 20,
                    spentTimeInHour: 2,
                    switchTimes: 1,
                    apps: {},
                }) +
                '{"_id":"partial"'
        );
        writeFileSync(
            legacy.kanbanDB,
            line({
                _id: 'board-1',
                name: 'Board',
                description: '',
                lists: ['list-1'],
                unknownBoardField: 42,
            })
        );
        writeFileSync(
            legacy.cardsDB,
            line({
                _id: 'card-1',
                title: 'Card',
                content: 'Content',
                sessionIds: ['session-1'],
                spentTimeInHour: { estimated: 1, actual: 2 },
            })
        );
        writeFileSync(legacy.listsDB, line({ _id: 'list-1', title: 'List', cards: ['card-1'] }));
        writeFileSync(
            legacy.moveDB,
            line({ fromListId: 'a', toListId: 'b', cardId: 'card-1', time: 123 })
        );
        writeFileSync(
            legacy.settingDB,
            line({ name: 'setting', themeId: 'old', customThemes: [] }) +
                line({ name: 'setting', themeId: 'latest', followSystemTheme: true, future: 1 })
        );

        const target = join(root, 'pomodoro.sqlite');
        const backupDir = join(root, 'backup');
        const logPath = join(root, 'migration.log');
        const stats = migrateNedbToSqlite({
            target,
            backupDir,
            logPath,
            legacyPaths: legacy,
        });

        expect(stats.imported).toMatchObject({
            sessions: 2,
            boards: 1,
            cards: 1,
            lists: 1,
            moves: 1,
            settings: 1,
        });
        expect(stats.skipped.sessions).toBe(1);
        expect(existsSync(target)).toBeTruthy();
        expect(existsSync(join(backupDir, 'session.nedb'))).toBeTruthy();
        expect(readFileSync(logPath, 'utf-8')).toContain('sessions: imported=2 skipped=1');

        // Old files are the rollback path and must stay byte-for-byte untouched.
        expect(existsSync(legacy.sessionDB)).toBeTruthy();

        const db = openSqlite(target);
        try {
            expect(getUserVersion(db)).toBe(1);
            const session = JSON.parse(
                (db.prepare('SELECT doc FROM sessions WHERE _id = ?').get('session-1') as any).doc
            );
            expect(session.unknownSessionField).toBe('keep-me');
            expect(session.apps.Chrome.spentTimeInHour).toBe(1.5);

            const board = JSON.parse(
                (db.prepare('SELECT doc FROM boards WHERE _id = ?').get('board-1') as any).doc
            );
            expect(board.unknownBoardField).toBe(42);
            expect(board.lists).toEqual(['list-1']);

            const card = JSON.parse(
                (db.prepare('SELECT doc FROM cards WHERE _id = ?').get('card-1') as any).doc
            );
            expect(card.spentTimeInHour).toEqual({ estimated: 1, actual: 2 });

            expect((db.prepare('SELECT COUNT(*) AS n FROM moves').get() as any).n).toBe(1);
            const settings = db.prepare('SELECT key, value FROM settings').all() as {
                key: string;
                value: string;
            }[];
            expect(settings.find((row) => row.key === 'themeId')?.value).toBe('"latest"');
            expect(settings.find((row) => row.key === 'future')?.value).toBe('1');
        } finally {
            db.close();
        }
    });

    it('creates an empty schema when there are no legacy files', () => {
        const target = join(root, 'empty.sqlite');
        migrateNedbToSqlite({
            target,
            legacyPaths: {
                sessionDB: join(root, 'missing-session.nedb'),
                settingDB: join(root, 'missing-setting.nedb'),
                kanbanDB: join(root, 'missing-kanban.nedb'),
                cardsDB: join(root, 'missing-cards.nedb'),
                listsDB: join(root, 'missing-lists.nedb'),
                moveDB: join(root, 'missing-moves.nedb'),
            },
        });

        const db = openSqlite(target);
        try {
            expect(getUserVersion(db)).toBe(1);
            expect((db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as any).n).toBe(0);
            expect((db.prepare('SELECT COUNT(*) AS n FROM settings').get() as any).n).toBe(0);
        } finally {
            db.close();
        }
    });
});
