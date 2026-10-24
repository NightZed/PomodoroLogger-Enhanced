import { readFile, rm, mkdir, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, relative, resolve } from 'path';
import { modelPath, screenshotDir } from './config';
import type { KnnModel } from './learner/appKnn';

/**
 * Files the renderer is allowed to ask about, without ever exposing a generic
 * filesystem API:
 *
 * - screenshots are written/removed only inside `screenshotDir`;
 * - the KNN model is one fixed file;
 * - deleting all user data clears those two locations.
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

/** Removes the derived KNN model and recreates an empty screenshot directory. */
export async function clearUserFiles(): Promise<void> {
    try {
        await unlink(modelPath.knnPath);
    } catch (error) {
        if (!isNotFound(error)) {
            console.error('[userFiles] failed to delete the KNN model', error);
        }
    }

    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });
}

export async function loadKnnModel(): Promise<KnnModel | undefined> {
    try {
        const raw = await readFile(modelPath.knnPath, { encoding: 'utf-8' });
        return JSON.parse(raw) as KnnModel;
    } catch (error) {
        if (!isNotFound(error)) {
            // A corrupt model must not block training; the next loadModel()
            // request retrains and overwrites it.
            console.error('[userFiles] failed to read the KNN model', error);
        }
        return undefined;
    }
}

export async function saveKnnModel(model: KnnModel): Promise<void> {
    await writeFile(modelPath.knnPath, JSON.stringify(model), { encoding: 'utf-8' });
}
