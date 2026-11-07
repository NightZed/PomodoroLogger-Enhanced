import { rm, mkdir, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve } from 'path';
import { screenshotDir } from './config';

/**
 * Files the renderer is allowed to ask about, without ever exposing a generic
 * filesystem API:
 *
 * - screenshots are written/removed only inside `screenshotDir`;
 * - deleting all user data clears that location.
 */

const MAX_SCREENSHOT_DATA_URL = 20 * 1024 * 1024;

function isScreenshotPath(filePath: string): boolean {
    const root = resolve(screenshotDir);
    const target = resolve(filePath);
    const rel = relative(root, target);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function isNotFound(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/** Writes a browser-produced data URL and returns the file the record stores. */
export async function saveScreenshot(dataUrl: string): Promise<string> {
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_SCREENSHOT_DATA_URL) {
        throw new Error('Invalid screenshot payload');
    }

    const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) {
        throw new Error('Invalid screenshot data URL');
    }

    const filePath = join(screenshotDir, `${Date.now()}.jpg`);
    await writeFile(filePath, Buffer.from(match[1], 'base64'));
    return filePath;
}

/** Removes files referenced by a discarded session; unknown/foreign paths are ignored. */
export async function deleteScreenshots(paths: string[]): Promise<void> {
    if (!Array.isArray(paths)) {
        return;
    }

    await Promise.all(
        paths.slice(0, 1000).map(async (filePath) => {
            if (typeof filePath !== 'string' || !isScreenshotPath(filePath)) {
                return;
            }

            try {
                await unlink(filePath);
            } catch (error) {
                if (!isNotFound(error)) {
                    console.error('[userFiles] failed to delete screenshot', filePath, error);
                }
            }
        })
    );
}

/** Removes all screenshots and recreates an empty screenshot directory. */
export async function clearUserFiles(): Promise<void> {
    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
}
