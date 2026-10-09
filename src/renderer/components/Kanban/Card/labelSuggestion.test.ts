import { getLabelSuggestions } from './labelSuggestion';

const boardLabels = [
    { name: 'zeta', color: '#0079bf' },
    { name: 'alpha', color: '#61bd4f' },
    { name: 'bug', color: '#eb5a46' },
    { name: 'feature', color: '#f2d600' },
];

describe('getLabelSuggestions', () => {
    it('returns every board label for a blank input, alphabetically', () => {
        expect(getLabelSuggestions(boardLabels, [], '').map((x) => x.name)).toEqual([
            'alpha',
            'bug',
            'feature',
            'zeta',
        ]);
        expect(getLabelSuggestions(boardLabels, [], '   ').map((x) => x.name)).toEqual([
            'alpha',
            'bug',
            'feature',
            'zeta',
        ]);
    });

    it('orders alphabetically even when the source order is scrambled', () => {
        const scrambled = [{ name: 'zeta' }, { name: 'beta' }, { name: 'alpha' }];
        expect(getLabelSuggestions(scrambled, [], '').map((x) => x.name)).toEqual([
            'alpha',
            'beta',
            'zeta',
        ]);
    });

    it('filters by case-insensitive substring', () => {
        expect(getLabelSuggestions(boardLabels, [], 'FE').map((x) => x.name)).toEqual(['feature']);
        expect(getLabelSuggestions(boardLabels, [], 'ALP').map((x) => x.name)).toEqual(['alpha']);
        expect(getLabelSuggestions(boardLabels, [], 'no-match')).toEqual([]);
    });

    it('trims the input before matching', () => {
        expect(getLabelSuggestions(boardLabels, [], '  bug  ').map((x) => x.name)).toEqual(['bug']);
    });

    it('excludes labels already on the card', () => {
        expect(getLabelSuggestions(boardLabels, [{ name: 'bug' }], '').map((x) => x.name)).toEqual([
            'alpha',
            'feature',
            'zeta',
        ]);
        // an on-card label is excluded even when its name is typed out
        expect(getLabelSuggestions(boardLabels, [{ name: 'bug' }], 'bug')).toEqual([]);
    });

    it('keeps the color of each suggestion', () => {
        const [first] = getLabelSuggestions(boardLabels, [], 'alp');
        expect(first).toEqual({ name: 'alpha', color: '#61bd4f' });
    });

    it('collapses duplicate names to the first occurrence', () => {
        const withDupes = [
            { name: 'bug', color: '#eb5a46' },
            { name: 'alpha', color: '#61bd4f' },
            { name: 'bug', color: '#ff9f1a' },
        ];
        expect(getLabelSuggestions(withDupes, [], '')).toEqual([
            { name: 'alpha', color: '#61bd4f' },
            { name: 'bug', color: '#eb5a46' },
        ]);
    });

    it('does not mutate the source array', () => {
        const source = [{ name: 'zeta' }, { name: 'alpha' }];
        getLabelSuggestions(source, [], '');
        expect(source.map((x) => x.name)).toEqual(['zeta', 'alpha']);
    });
});
