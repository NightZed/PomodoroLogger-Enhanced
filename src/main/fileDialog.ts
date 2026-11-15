import { dialog } from 'electron';
import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { existsSync } from 'fs';
import { dirname } from 'path';
import * as db from './db';
import { log } from './log';

/**
 * What a file dialog is picking. Each kind remembers its own folder: audio,
 * wallpapers and data backups come from different places on disk, and a shared
 * memory would send the second dialog to the first one's folder -- worse than
 * no memory at all when both are opened from the settings page.
 */
export type FileDialogKind = 'sound' | 'wallpaper' | 'import';

type DialogDirs = Partial<Record<FileDialogKind, string>>;

/**
 * The remembered folders, stored as one field of the settings document.
 *
 * They are not preferences the user edits, so they do not go through
 * `Setting` -- but the settings table is where the app already keeps state that
 * has to survive a restart, and its repository merges `$set` into the existing
 * document, so this field cannot drop the renderer's settings.
 */
const SETTING_DOC = { name: 'setting' };
const SETTING_KEY = 'fileDialogDirs';

async function readDirs(): Promise<DialogDirs> {
    const settings = await db.DBs.settingDB.findOne(SETTING_DOC);
    const dirs = settings?.[SETTING_KEY];
    return dirs !== null && typeof dirs === 'object' ? (dirs as DialogDirs) : {};
}

async function readLastDir(kind: FileDialogKind): Promise<string | undefined> {
    try {
        const dir = (await readDirs())[kind];
        if (typeof dir !== 'string') {
            return undefined;
        }

        // The folder can disappear between two picks (a removed drive, a
        // cleaned temp folder). Handing it to the dialog anyway would open
        // nowhere useful, so let the system pick its own default.
        return existsSync(dir) ? dir : undefined;
    } catch (error) {
        log('app', 'warn', 'file dialog: cannot read the last folder', error);
        return undefined;
    }
}

async function rememberDir(kind: FileDialogKind, filePath: string): Promise<void> {
    try {
        // Read and write the whole map: `SettingsRepository` rewrites the
        // settings table on every update, so a nested `$set` would have to be
        // handled by its update implementation; merging here keeps the other
        // kinds' folders in the same write.
        const dirs = await readDirs();
        await db.DBs.settingDB.update(
            SETTING_DOC,
            { $set: { [SETTING_KEY]: { ...dirs, [kind]: dirname(filePath) } } },
            { upsert: true }
        );
    } catch (error) {
        // Remembering the folder is a convenience; failing to do so must not
        // turn a successful pick into an error.
        log('app', 'warn', 'file dialog: cannot remember the folder', error);
    }
}

/**
 * `dialog.showOpenDialog` that opens in the folder `kind` last picked a file
 * from.
 *
 * A cancelled dialog leaves that kind's memory untouched.
 */
export async function showOpenFileDialog(
    options: Omit<OpenDialogOptions, 'defaultPath'>,
    kind: FileDialogKind
): Promise<OpenDialogReturnValue> {
    const result = await dialog.showOpenDialog({
        ...options,
        defaultPath: await readLastDir(kind),
    });

    const picked = result.filePaths[0];
    if (!result.canceled && picked) {
        await rememberDir(kind, picked);
    }

    return result;
}
