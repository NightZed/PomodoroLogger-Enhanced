import { workers } from '../workers';
import { PomodoroRecord } from './type';
import { modelPath, screenshotDir } from '../../config';
import * as fs from 'fs';

const dbWorkers = workers.dbWorkers;
export function renameIllegalName(record: PomodoroRecord) {
    for (const app in record.apps) {
        const appRow = record.apps[app];
        for (const title in appRow.titleSpentTime) {
            const newTitle = title.replace(/\./g, '-,-');
            if (title !== newTitle) {
                appRow.titleSpentTime[newTitle] = appRow.titleSpentTime[title];
                delete appRow.titleSpentTime[title];
            }
        }

        const newAppName = app.replace(/\..*$/g, '');
        if (newAppName !== app) {
            record.apps[newAppName] = appRow;
            delete record.apps[app];
        }
    }
}

/* istanbul ignore next */
// Debug helper: validates a session record's aggregate fields against its
// per-app breakdown. Kept (rather than deleted) for future troubleshooting.
function _consistencyCheck(record: PomodoroRecord) {
    if (record.startTime === 0) {
        throw new Error('no startTime');
    }
    type field = 'switchTimes' | 'spentTimeInHour' | 'screenStaticDuration';
    function sumCheck(fieldName: field) {
        // @ts-ignore
        if (record[fieldName] === undefined) {
            return;
        }

        const aggFromApp = Object.values(record.apps).reduce((left, right) => {
            // @ts-ignore
            return left + right[fieldName];
        }, 0);

        // @ts-ignore
        if (Math.abs(aggFromApp - record[fieldName]) > 1e-6) {
            console.warn(`${fieldName} info does not add up`);
            // @ts-ignore
            record[fieldName] = aggFromApp;
        }
    }

    sumCheck('switchTimes');
    sumCheck('spentTimeInHour');
    sumCheck('screenStaticDuration');
}

export async function addSession(record: PomodoroRecord) {
    if (!record.boardId) {
        // TODO: invoke ML inference
    }
    // @ts-ignore
    await dbWorkers.sessionDB.insert(record).catch((err) => console.error(err));
}

export async function removeSession(startTime: number) {
    // @ts-ignore
    await dbWorkers.sessionDB.remove({ startTime });
}

export async function getTodaySessions(): Promise<PomodoroRecord[]> {
    const todayStartTime = new Date(new Date().toDateString()).getTime();
    const ans = (await dbWorkers.sessionDB.find(
        { startTime: { $gt: todayStartTime } },
        {}
    )) as unknown as PomodoroRecord[];
    return ans;
}

export async function getAllSession(): Promise<PomodoroRecord[]> {
    // @ts-ignore
    return (await dbWorkers.sessionDB.find({}, {})) as PomodoroRecord[];
}

export const deleteFolderRecursive = (path: string) => {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach((file) => {
            const curPath = path + '/' + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                // recurse
                deleteFolderRecursive(curPath);
            } else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};

/**
 * Delete the screenshot files a discarded session had recorded. Called when a
 * record is thrown away whole (Stop, mode switch, unmount -- see
 * `Monitor.discard`): the record referencing them is dropped, so the files
 * would be orphans on disk. A SAVED record's files must stay -- `clear()`
 * alone never deletes anything.
 *
 * A file that is already gone (or locked) is skipped: cleanup must never fail
 * the session flow that triggered it.
 */
export function deleteScreenshots(paths: string[]) {
    for (const p of paths) {
        try {
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
            }
        } catch (e) {
            console.error('[sessionManager] failed to delete screenshot', p, e);
        }
    }
}

/**
 * Delete all recorded data while keeping the settings.
 *
 * With SQLite, the records live in one database file, so "Delete All Data"
 * clears the user tables (sessions, boards, lists, cards, moves) and removes
 * the derived KNN model and screenshots. The settings table is deliberately
 * untouched: timers, theme and wallpaper are app configuration, not history.
 * The legacy `.nedb` files also stay on disk as the migration backup.
 */
export async function deleteAllUserData() {
    const dbWorkers = workers.dbWorkers;
    await Promise.all([
        dbWorkers.sessionDB.remove({}, { multi: true }),
        dbWorkers.kanbanDB.remove({}, { multi: true }),
        dbWorkers.listsDB.remove({}, { multi: true }),
        dbWorkers.cardsDB.remove({}, { multi: true }),
        dbWorkers.moveDB.remove({}, { multi: true }),
    ]);

    try {
        if (fs.existsSync(modelPath.knnPath)) {
            fs.unlinkSync(modelPath.knnPath);
        }
    } catch (e) {
        console.error('[sessionManager] failed to delete the KNN model', e);
    }

    try {
        if (fs.existsSync(screenshotDir)) {
            deleteFolderRecursive(screenshotDir);
        }
        fs.mkdirSync(screenshotDir, { recursive: true });
    } catch (e) {
        console.error('[sessionManager] failed to clear the screenshots', e);
    }
}

export function getIndexToTitleApp(record: PomodoroRecord): [string, string][] {
    const indexToTitle: [string, string][] = [];
    for (const app in record.apps) {
        for (const title in record.apps[app].titleSpentTime) {
            indexToTitle[record.apps[app].titleSpentTime[title].index] = [title, app];
        }
    }

    return indexToTitle;
}
