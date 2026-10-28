import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import type { SourceData } from '../../shared/dataMerger/dataMerger';
import { dbBkBaseDir } from '../config';
import { DBs, loadDBs } from '../db';
import { readAllData } from './read';
import { writeAllFile } from './write';

const backupPath = path.join(dbBkBaseDir, 'pomodoro-logger-data-backup.json');

const data: SourceData = {
    boards: {
        board: {
            _id: 'board',
            name: 'Board',
            spentHours: 0,
            description: 'Board description',
            lists: ['list'],
            focusedList: 'list',
            doneList: 'list',
            relatedSessions: [],
        },
    },
    lists: {
        list: { _id: 'list', title: 'List', cards: ['card'] },
    },
    cards: {
        card: {
            _id: 'card',
            title: 'Card',
            content: 'Card content',
            sessionIds: ['session'],
            spentTimeInHour: { estimated: 2, actual: 1 },
        },
    },
    move: [{ fromListId: 'list', toListId: 'list', cardId: 'card', time: 123 }],
    records: [
        {
            _id: 'session',
            boardId: 'board',
            startTime: 456,
            spentTimeInHour: 1,
            switchTimes: 2,
            screenStaticDuration: 0,
            apps: {},
            switchActivities: [],
            stayTimeInSecond: [],
        },
    ],
};

async function clearData() {
    await loadDBs();
    for (const name of ['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB'] as const) {
        await DBs[name].remove({}, { multi: true });
    }
}

describe('main io import/export', () => {
    beforeEach(async () => {
        await clearData();
        if (existsSync(backupPath)) {
            rmSync(backupPath, { force: true });
        }
    });

    afterAll(() => {
        if (existsSync(backupPath)) {
            rmSync(backupPath, { force: true });
        }
    });

    it('writes imported data and reads the same shape back', async () => {
        await writeAllFile(data);

        await expect(readAllData()).resolves.toEqual(data);
    });

    it('backs up the previous data before replacing it', async () => {
        await writeAllFile(data);

        const replacement: SourceData = {
            ...data,
            cards: {},
            lists: {},
            boards: {},
            move: [],
            records: [],
        };
        await writeAllFile(replacement);

        expect(existsSync(backupPath)).toBe(true);
        const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
        expect(backup).toEqual(data);
    });
});
