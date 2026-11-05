import { shell } from 'electron';
import { getLogDir } from './log';

/**
 * Shows the folder that holds `app.log`, `crash.log` and `active-win.log` in
 * the OS file manager. Mirrors `openDataDir.ts`: `shell.openPath` resolves with
 * an error string (empty on success), which becomes a rejection the renderer
 * can report.
 */
export async function openLogDir(): Promise<void> {
    const error = await shell.openPath(getLogDir());
    if (error) {
        throw new Error(error);
    }
}
