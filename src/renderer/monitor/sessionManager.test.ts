import {
    addSession,
    removeSession,
    getAllSession,
    renameIllegalName,
    getTodaySessions,
    deleteFolderRecursive,
    deleteScreenshots,
    deleteAllUserData,
} from './sessionManager';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { generateRandomName } from '../utils';
import { PomodoroRecord } from './type';
import { createRecord } from '../../../test/utils';
import dbs from '../dbs';

describe('sessionManager', () => {
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

    it('deleteAllUserData clears sessions but keeps the settings', async () => {
        const record = createRecord('delete-all', 0, []);
        await addSession(record);
        await dbs.settingDB.update(
            { name: 'setting' },
            { $set: { themeId: 'keep-me' } },
            { upsert: true }
        );

        await deleteAllUserData();

        expect(await getAllSession()).toStrictEqual([]);
        expect((await dbs.settingDB.findOne({ name: 'setting' }))?.themeId).toBe('keep-me');
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
