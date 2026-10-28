import { ColorEncoder, ColorScheme } from './ColorEncoder';

describe('ColorEncoder', () => {
    const encoder = new ColorEncoder();

    it.each([
        [0, 0, 0],
        [18, 52, 86],
        [255, 255, 255],
    ])('round-trips rgb(%i, %i, %i)', (r, g, b) => {
        const encoded = encoder.encodeColor(r, g, b);

        expect(encoded).toMatch(/^[0-9a-f]{6}$/);
        expect(encoder.decodeColor(encoded)).toEqual([r, g, b]);
    });

    it('produces a readable hex color with a bounded brightness', () => {
        for (let i = 0; i < 100; i += 1) {
            const color = encoder.getAColor();
            expect(color).toMatch(/^#[0-9a-f]{6}$/);

            const [r, g, b] = encoder.decodeColor(color.slice(1));
            const sum = r + g + b;
            expect(sum).toBeGreaterThanOrEqual(60);
            expect(sum).toBeLessThanOrEqual(240 * 3);
        }
    });
});

describe('ColorScheme', () => {
    it('keeps one stable color per name', () => {
        const scheme = new ColorScheme();
        const first = scheme.get('project');

        expect(scheme.get('project')).toBe(first);
        expect(scheme.get('project')).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('gives different names their own entries', () => {
        const scheme = new ColorScheme();
        scheme.get('one');
        scheme.get('two');

        // Two random colors can collide in theory; the map must still keep both
        // names and return a color for each.
        expect(scheme.get('one')).toMatch(/^#[0-9a-f]{6}$/);
        expect(scheme.get('two')).toMatch(/^#[0-9a-f]{6}$/);
    });
});
