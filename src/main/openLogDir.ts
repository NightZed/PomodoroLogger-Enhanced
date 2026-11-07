import { mkdirSync } from 'fs';
import { shell } from 'electron';
import { getLogDir } from './log';

/**
 * Shows the folder that holds `app.log`, `crash.log`, `active-win.log` and
 * `data.log` in the OS file manager. Mirrors `openDataDir.ts`:
 * `shell.openPath` resolves with an error string (empty on success), which
 * becomes a rejection the renderer can report.
 *
 * The folder is created first: the logger only creates it on its first write,
 * and a user whose level is `error` with no crash yet has no `logs/` at all --
 * `shell.openPath` would then fail on exactly the button that is supposed to
 * help them find the log.
 */
export async function openLogDir(): Promise<void> {
    const dir = getLogDir();

    try {
        mkdirSync(dir, { recursive: true });
    } catch {
        // Let `shell.openPath` report the real problem to the renderer.
    }

    const error = await shell.openPath(dir);
    if (error) {
        throw new Error(error);
    }
}
