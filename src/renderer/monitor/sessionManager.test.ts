import {
    addSession,
    removeSession,
    getAllSession,
    renameIllegalName,
    getTodaySessions,
    deleteScreenshots,
    deleteAllUserData,
} from './sessionManager';
import { PomodoroRecord } from './type';
import { createRecord } from '../../../test/utils';
import dbs from '../dbs';

describe('sessionManager', () => {
    it('persists a session so it shows up in the session list', async () => {
        const record: PomodoroRecord = {
            ...createRecord('board-add', 0, []),
            _id: 'session-add',
            startTime: 1_700_000_000_000,
        };

        await addSession(record);
        const sessions = await getAllSession();
        const ans = sessions.find((v) => v.boardId === record.boardId);
        expect(ans).toBeTruthy();
    });

    it('removes a session by its start time', async () => {
        const record: PomodoroRecord = {
            ...createRecord('board-remove', 0, []),
            _id: 'session-remove',
            startTime: 1_700_000_001_000,
        };

        await addSession(record);
        await removeSession(record.startTime);
        const sessions = await getAllSession();
        const ans = sessions.find((v) => v.boardId === record.boardId);
        expect(ans).toBeUndefined();
    });

    it('strips dots from app and title keys', () => {
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

    it('forwards the screenshots of a discarded session to the main process', () => {
        const deleteScreenshotsApi = jest.fn().mockResolvedValue(undefined);
        (window as any).api = { ...(window as any).api, deleteScreenshots: deleteScreenshotsApi };

        const paths = ['drop1.jpg', 'drop2.jpg', 'missing.jpg'];
        deleteScreenshots(paths);

        expect(deleteScreenshotsApi).toHaveBeenCalledWith(paths);
    });

    it('deleteAllUserData clears sessions but keeps the settings', async () => {
        const clearUserFiles = jest.fn().mockResolvedValue(undefined);
        (window as any).api = { ...(window as any).api, clearUserFiles };

        const record = createRecord('delete-all', 0, []);
        await addSession(record);
        await dbs.settingDB.update(
            { name: 'setting' },
            { $set: { themeId: 'keep-me' } },
            { upsert: true }
        );

        await deleteAllUserData();

        expect(clearUserFiles).toHaveBeenCalledTimes(1);
        expect(await getAllSession()).toStrictEqual([]);
        expect((await dbs.settingDB.findOne({ name: 'setting' }))?.themeId).toBe('keep-me');
    });

    it('returns only sessions started today', async () => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const midnight = startOfToday.getTime();
        const todaySession = { ...createRecord('today', 0, []), startTime: midnight + 3600_000 };
        const yesterdayRecord = {
            ...createRecord('yesterday', 0, []),
            startTime: midnight - 3600_000,
        };
        await addSession(todaySession);
        await addSession(yesterdayRecord);
        const sessions = await getTodaySessions();
        expect(sessions.some((record) => record.boardId === 'today')).toBeTruthy();
        expect(sessions.every((record) => record.boardId !== 'yesterday')).toBeTruthy();
    });
});
