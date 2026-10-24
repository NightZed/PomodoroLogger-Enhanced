import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { screenshotDir, modelPath } from './config';
import {
    clearUserFiles,
    deleteScreenshots,
    loadKnnModel,
    saveKnnModel,
    saveScreenshot,
} from './userFiles';
import type { KnnModel } from './learner/appKnn';

describe('main-process user files', () => {
    it('writes a screenshot data URL and deletes only known screenshot paths', async () => {
        const dataUrl = `data:image/png;base64,${Buffer.from('pixels').toString('base64')}`;
        const filePath = await saveScreenshot(dataUrl);
        expect(readFileSync(filePath, 'utf8')).toBe('pixels');

        await deleteScreenshots([filePath]);
        expect(existsSync(filePath)).toBe(false);

        // A path outside screenshotDir must be ignored, even if it exists.
        const outside = join(screenshotDir, '..', 'outside-b7.jpg');
        writeFileSync(outside, 'keep');
        try {
            await deleteScreenshots([outside]);
            expect(existsSync(outside)).toBe(true);
        } finally {
            unlinkSync(outside);
        }
    });

    it('rejects non-image payloads', async () => {
        await expect(saveScreenshot('not a data URL')).rejects.toThrow(
            'Invalid screenshot data URL'
        );
    });

    it('loads, saves and clears the KNN model', async () => {
        const model: KnnModel = {
            encoder: { a: 0 },
            encodings: [{ encoding: [1], project: 'board' }],
            k: 5,
        };

        await saveKnnModel(model);
        await expect(loadKnnModel()).resolves.toStrictEqual(model);

        await clearUserFiles();
        await expect(loadKnnModel()).resolves.toBeUndefined();
        expect(existsSync(modelPath.knnPath)).toBe(false);
        expect(existsSync(screenshotDir)).toBe(true);
    });
});
