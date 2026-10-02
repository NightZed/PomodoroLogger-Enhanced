import { uid } from './uid';

describe('util.uid', () => {
    it('generates 9-character ids, like the shortid ids already in the nedb files', () => {
        const n = 1e3;
        for (let i = 0; i < n; i += 1) {
            expect(uid()).toHaveLength(9);
        }
    });

    it('starts with a letter so the id is a valid XML id in `clipPath="url(#id)"`', () => {
        const n = 1e3;
        for (let i = 0; i < n; i += 1) {
            expect(uid()).toMatch(/^[A-Za-z]/);
        }
    });

    it('only uses URL-safe characters', () => {
        const n = 1e3;
        for (let i = 0; i < n; i += 1) {
            expect(uid()).toMatch(/^[A-Za-z0-9_-]{9}$/);
        }
    });

    it('does not repeat ids', () => {
        const n = 1e4;
        const ids = new Set<string>();
        for (let i = 0; i < n; i += 1) {
            ids.add(uid());
        }

        expect(ids.size).toBe(n);
    });
});
