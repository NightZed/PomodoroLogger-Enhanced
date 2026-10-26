import { shell } from 'electron';
import { dataDir } from './config';

/**
 * Shows the folder that holds the databases, backups and periodic screenshots
 * in the operating system's file manager.
 *
 * `shell.openPath` resolves with an error string (empty on success) instead of
 * rejecting, so the message is turned into a rejection the renderer can report.
 */
export async function openDataDir(): Promise<void> {
    const error = await shell.openPath(dataDir);
    if (error) {
        throw new Error(error);
    }
}
