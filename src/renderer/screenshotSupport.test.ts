import { isScreenshotAvailable } from './screenshotSupport';

describe('renderer/screenshotSupport', () => {
    it('keeps the feature in development builds, where the flag is absent', () => {
        expect(isScreenshotAvailable(undefined)).toBe(true);
        expect(isScreenshotAvailable(false)).toBe(true);
    });

    it('retires the feature in a packaged build', () => {
        expect(isScreenshotAvailable(true)).toBe(false);
    });
});
