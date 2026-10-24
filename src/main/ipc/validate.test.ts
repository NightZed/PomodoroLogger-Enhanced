import {
    assertBoolean,
    assertKnnModel,
    assertOpenExternalUrl,
    assertScreenshotDataUrl,
    assertScreenshotPaths,
    assertString,
    assertTrayIconPayload,
    assertTrayMenuItems,
} from './validate';

describe('IPC validators', () => {
    it('checks primitives and bounded strings', () => {
        expect(assertBoolean(true, 'flag')).toBe(true);
        expect(() => assertBoolean('true', 'flag')).toThrow(TypeError);
        expect(assertString('ok', 'name', 2)).toBe('ok');
        expect(() => assertString('too long', 'name', 2)).toThrow(TypeError);
    });

    it('only accepts web URLs for openExternal', () => {
        expect(assertOpenExternalUrl('https://example.com/a')).toBe('https://example.com/a');
        expect(() => assertOpenExternalUrl('file:///etc/passwd')).toThrow(TypeError);
        expect(() => assertOpenExternalUrl('javascript:alert(1)')).toThrow(TypeError);
        expect(() => assertOpenExternalUrl('not a url')).toThrow(TypeError);
    });

    it('checks tray menu and icon payloads', () => {
        expect(assertTrayMenuItems([{ key: 'start', label: 'Start', enabled: true }])).toHaveLength(
            1
        );
        expect(() => assertTrayMenuItems([{ key: 'start', label: 'Start' }])).toThrow(TypeError);
        expect(() =>
            assertTrayMenuItems([{ key: 'x', label: 'x', enabled: true, extra: 1 }])
        ).not.toThrow();

        expect(
            assertTrayIconPayload({ src: 'data:image/png;base64,AA==', scaleFactor: 2 })
        ).toEqual({ src: 'data:image/png;base64,AA==', scaleFactor: 2 });
        expect(() =>
            assertTrayIconPayload({ src: 'data:image/png;base64,AA==', scaleFactor: Infinity })
        ).toThrow(TypeError);
    });

    it('checks screenshot payloads and paths', () => {
        expect(assertScreenshotDataUrl('data:image/jpeg;base64,AA==')).toBe(
            'data:image/jpeg;base64,AA=='
        );
        expect(() => assertScreenshotDataUrl('https://example.com/a.jpg')).toThrow(TypeError);
        expect(assertScreenshotPaths(['a.jpg'])).toEqual(['a.jpg']);
        expect(() => assertScreenshotPaths([1])).toThrow(TypeError);
    });

    it('accepts only the serialized KNN shape', () => {
        const model = { encoder: { app: 0 }, encodings: [], k: 5 };
        expect(assertKnnModel(model)).toBe(model);
        expect(() => assertKnnModel({ encoder: {}, encodings: [] })).toThrow(TypeError);
        expect(() => assertKnnModel({ encoder: [], encodings: [], k: 5 })).toThrow(TypeError);
    });
});
