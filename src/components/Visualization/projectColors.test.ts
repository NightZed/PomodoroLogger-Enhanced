import { createProjectColorOf } from './projectColors';
import { dayTokens, nightTokens } from '../../renderer/theme/tokens';

describe('createProjectColorOf', () => {
    it('keeps every project on its color when a newer project joins', () => {
        const before = createProjectColorOf({ a: { name: 'Alpha', createdTime: 1 } }, dayTokens);
        const after = createProjectColorOf(
            { a: { name: 'Alpha', createdTime: 1 }, b: { name: 'Beta', createdTime: 2 } },
            dayTokens
        );

        expect(after('Alpha')).toBe(before('Alpha'));
        expect(after('Beta')).not.toBe(after('Alpha'));
    });

    it('does not depend on the order the board map happens to hold', () => {
        const alphaFirst = createProjectColorOf(
            { a: { name: 'Alpha', createdTime: 5 }, b: { name: 'Beta', createdTime: 5 } },
            dayTokens
        );
        const betaFirst = createProjectColorOf(
            { b: { name: 'Beta', createdTime: 5 }, a: { name: 'Alpha', createdTime: 5 } },
            dayTokens
        );

        expect(alphaFirst('Alpha')).toBe(betaFirst('Alpha'));
    });

    it('gives unassigned sessions a color outside the project palette', () => {
        const colorOf = createProjectColorOf({ a: { name: 'Alpha', createdTime: 1 } }, dayTokens);

        expect(dayTokens.treemapColors).not.toContain(colorOf(undefined));
    });

    it('does not let a duplicated name shift the next project on the palette', () => {
        const withDuplicate = createProjectColorOf(
            {
                a: { name: 'Alpha', createdTime: 1 },
                duplicated: { name: 'Alpha', createdTime: 2 },
                b: { name: 'Beta', createdTime: 3 },
            },
            dayTokens
        );
        const withoutDuplicate = createProjectColorOf(
            { a: { name: 'Alpha', createdTime: 1 }, b: { name: 'Beta', createdTime: 3 } },
            dayTokens
        );

        expect(withDuplicate('Beta')).toBe(withoutDuplicate('Beta'));
    });

    it('takes its colors from the palette of the active theme', () => {
        const boards = { a: { name: 'Alpha', createdTime: 1 } };

        expect([dayTokens.treemapColors, nightTokens.treemapColors]).toEqual([
            expect.arrayContaining([createProjectColorOf(boards, dayTokens)('Alpha')]),
            expect.arrayContaining([createProjectColorOf(boards, nightTokens)('Alpha')]),
        ]);
    });
});
