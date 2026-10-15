import {
    addSession,
    removeSession,
    getAllSession,
    renameIllegalName,
    loadDB,
    loadDBSync,
    getTodaySessions,
    deleteFolderRecursive,
    deleteScreenshots,
    deleteAllUserData,
} from './sessionManager';
import { basename, join } from 'path';
import { dbBaseDir, dbPaths } from '../../config';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { generateRandomName } from '../utils';
import { PomodoroRecord } from './type';
import { createRecord } from '../../../test/utils';
const { sessionDB } = dbPaths;

describe('sessionManager', () => {
    beforeAll(() => {
        if (existsSync(sessionDB)) {
            try {
                unlinkSync(sessionDB);
            } catch (e) {}
        }
    });

    it('addSession', async () => {
        const record: PomodoroRecord = {
            switchActivities: [],
            _id: generateRandomName(),
            boardId: generateRandomName(),
            startTime: new Date().getTime(),
            apps: {},
            switchTimes: 0,
            screenStaticDuration: 0,
            spentTimeInHour: 0,
        };

        await addSession(record);
        const sessions = await getAllSession();
        const ans = sessions.find((v) => v.boardId === record.boardId);
        expect(ans).toBeTruthy();
    });

    it('removeSession', async () => {
        const record: PomodoroRecord = {
            _id: generateRandomName(),
            boardId: generateRandomName(),
            startTime: new Date().getTime(),
            switchActivities: [],
            apps: {},
            switchTimes: 0,
            screenStaticDuration: 0,
            spentTimeInHour: 0,
        };

        await addSession(record);
        await removeSession(record.startTime);
        const sessions = await getAllSession();
        const ans = sessions.find((v) => v.boardId === record.boardId);
        expect(ans).toBeUndefined();
    });

    it('should rename illegal names', () => {
        const record = createRecord('123', 123, [
            ['abc.exe', 123],
            ['abd.exe', 123],
            ['abf.eeeee', 123],
        ]);
        record.apps['abc.exe'].titleSpentTime = {
            'hello.123': { normalizedWeight: 0.12, occurrence: 123, index: 0 },
        };
        renameIllegalName(record);
        for (const app in record.apps) {
            expect(app.length).toBe(3);
            for (const title in record.apps[app].titleSpentTime) {
                expect(title.indexOf('.')).toBe(-1);
            }
        }
    });

    it('should rm folder recursively', () => {
        const root = generateRandomName();
        let child = root;
        let index = 0;
        while (index < 20) {
            mkdirSync(child);
            writeFileSync(join(child, generateRandomName()), 'hello');
            child = join(child, generateRandomName());
            index += 1;
        }

        deleteFolderRecursive(root);
        expect(existsSync(root)).toBeFalsy();
    });

    it('should delete the screenshots of a discarded session', () => {
        const root = generateRandomName();
        mkdirSync(root);
        const keep = join(root, 'keep.jpg');
        const drop1 = join(root, 'drop1.jpg');
        const drop2 = join(root, 'drop2.jpg');
        const missing = join(root, 'missing.jpg');
        writeFileSync(keep, 'keep');
        writeFileSync(drop1, 'drop1');
        writeFileSync(drop2, 'drop2');

        deleteScreenshots([drop1, drop2, missing]);
        // A file that never existed (already deleted, or the write failed) is
        // skipped without throwing.
        expect(existsSync(drop1)).toBeFalsy();
        expect(existsSync(drop2)).toBeFalsy();
        // Files of a session that was NOT discarded stay untouched.
        expect(existsSync(keep)).toBeTruthy();

        deleteFolderRecursive(root);
    });

    it('deleteAllUserData clears the data files but keeps the settings', async () => {
        // A directory of its own: the real dbBaseDir is shared with the other
        // test files running in parallel jest workers.
        const root = generateRandomName();
        const settingFile = join(root, basename(dbPaths.settingDB));
        mkdirSync(join(root, 'nested'), { recursive: true });
        writeFileSync(settingFile, '{"name":"setting"}');
        // nedb keeps a `~` copy next to the file while it compacts.
        writeFileSync(`${settingFile}~`, 'temp');
        writeFileSync(join(root, 'session.nedb'), '[]');
        writeFileSync(join(root, 'modelKnn.json'), '{}');
        writeFileSync(join(root, 'nested', 'cards.nedb'), '[]');

        await deleteAllUserData(root);

        // The settings database and its temporary sibling stay untouched.
        expect(existsSync(settingFile)).toBeTruthy();
        expect(existsSync(`${settingFile}~`)).toBeTruthy();
        expect(existsSync(join(root, 'session.nedb'))).toBeFalsy();
        expect(existsSync(join(root, 'modelKnn.json'))).toBeFalsy();
        expect(existsSync(join(root, 'nested'))).toBeFalsy();
        // The directory holds the settings file, so the directory stays too.
        expect(existsSync(root)).toBeTruthy();

        // A directory that is already gone is not an error.
        await deleteAllUserData(join(root, 'missing'));

        deleteFolderRecursive(root);
    });

    it('should load Db', async () => {
        {
            await loadDB(join(dbBaseDir, 'test_loading.db'));
        }
        {
            await loadDB(join(dbBaseDir, 'test_loading.db'));
        }
        {
            loadDBSync(join(dbBaseDir, 'test_loading.db'));
        }
        {
            loadDBSync(join(dbBaseDir, 'test_loading.db'));
        }
    });

    it('should return today sessions', async () => {
        const todaySession = createRecord('today', 0, []);
        const yesterdayRecord = createRecord('yesterday', 0, []);
        yesterdayRecord.startTime =
            new Date().getTime() - (new Date().getHours() + 1) * 3600 * 1000;
        await addSession(todaySession);
        await addSession(yesterdayRecord);
        const sessions = await getTodaySessions();
        expect(sessions.some((record) => record.boardId === 'today')).toBeTruthy();
        expect(sessions.every((record) => record.boardId !== 'yesterday')).toBeTruthy();
    });
});
