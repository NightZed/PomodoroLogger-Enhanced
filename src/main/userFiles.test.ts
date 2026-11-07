import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { screenshotDir } from './config';
import { clearUserFiles, deleteScreenshots, saveScreenshot } from './userFiles';

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

    it('clears the screenshots when deleting all user data', async () => {
        const dataUrl = `data:image/png;base64,${Buffer.from('pixels').toString('base64')}`;
        const filePath = await saveScreenshot(dataUrl);
        expect(existsSync(filePath)).toBe(true);

        await clearUserFiles();

        expect(existsSync(filePath)).toBe(false);
        expect(existsSync(screenshotDir)).toBe(true);
    });
});
