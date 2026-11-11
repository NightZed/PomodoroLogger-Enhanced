import {
    assertBoolean,
    assertMoveCardPayload,
    assertOpenExternalUrl,
    assertScreenshotDataUrl,
    assertScreenshotPaths,
    assertSessionEdits,
    assertString,
    assertTrayIconPayload,
    assertTrayMenuItems,
    assertUnassignedSessionsQuery,
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

    it('keeps "detach" (null) and "leave alone" (undefined) apart in session edits', () => {
        expect(
            assertSessionEdits([
                { _id: 's1', boardId: 'b1' },
                { _id: 's2', cardId: null },
                { _id: 's3', delete: true },
                { _id: 's4', boardId: null, cardId: 'c1' },
            ])
        ).toEqual([
            { _id: 's1', delete: false, boardId: 'b1', cardId: undefined },
            { _id: 's2', delete: false, boardId: undefined, cardId: null },
            { _id: 's3', delete: true, boardId: undefined, cardId: undefined },
            { _id: 's4', delete: false, boardId: null, cardId: 'c1' },
        ]);

        expect(() => assertSessionEdits([{ _id: 's1' }])).toThrow(TypeError);
        expect(() =>
            assertSessionEdits([
                { _id: 's1', cardId: null },
                { _id: 's1', boardId: 'b1' },
            ])
        ).toThrow(TypeError);
        expect(() => assertSessionEdits([{ _id: 's1', boardId: 1 }])).toThrow(TypeError);
    });

    it('checks the unassigned-sessions query', () => {
        expect(assertUnassignedSessionsQuery(undefined)).toEqual({});
        expect(assertUnassignedSessionsQuery({ boardId: 'b1', limit: 10 })).toEqual({
            boardId: 'b1',
            limit: 10,
        });
        expect(() => assertUnassignedSessionsQuery({ limit: 0 })).toThrow(TypeError);
        expect(() => assertUnassignedSessionsQuery({ limit: Infinity })).toThrow(TypeError);
    });

    it('checks the card-move payload', () => {
        expect(assertMoveCardPayload({ cardId: 'c1', targetListId: 'l1' })).toEqual({
            cardId: 'c1',
            targetListId: 'l1',
        });
        expect(() => assertMoveCardPayload({ cardId: 'c1' })).toThrow(TypeError);
        expect(() => assertMoveCardPayload({ cardId: 1, targetListId: 'l1' })).toThrow(TypeError);
        expect(() => assertMoveCardPayload(null)).toThrow(TypeError);
    });
});
