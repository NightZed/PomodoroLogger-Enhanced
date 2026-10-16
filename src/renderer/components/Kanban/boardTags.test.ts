import { getBoardSearchTags } from './boardTags';
import { Card, KanbanBoard, List } from './type';

describe('getBoardSearchTags', () => {
    const makeBoard = (listIds: string[]) => ({ lists: listIds } as KanbanBoard);
    const makeList = (cardIds: string[]) => ({ _id: 'l', title: 'l', cards: cardIds } as List);
    const makeCard = (content: string, labels?: { name: string; color: string }[]): Card => ({
        _id: 'c',
        title: 't',
        content,
        sessionIds: [],
        spentTimeInHour: { estimated: 0, actual: 0 },
        labels,
    });

    it('orders one pool of content tags and labels by unified card count', () => {
        const lists = {
            lA: makeList(['c1', 'c2']),
            lB: makeList(['c3', 'c4', 'c5']),
        };
        const cards = {
            c1: makeCard('nothing here'),
            c2: makeCard('#deep'),
            // '#deep' twice on one card still counts that card once; the
            // adjacent '#urgent' registers too (see the parseTag lookahead)
            c3: makeCard('#deep #deep #urgent'),
            c4: makeCard('', [
                { name: 'alpha', color: '#000' },
                { name: 'deep', color: '#000' },
            ]),
            c5: makeCard('#urgent'),
        };

        // deep: c2+c3+c4 = 3, urgent: c3+c5 = 2, alpha: c4 = 1
        expect(getBoardSearchTags(makeBoard(['lA', 'lB']), lists, cards)).toEqual([
            '#deep',
            '#urgent',
            '#alpha',
        ]);
    });

    it('breaks count ties alphabetically (the labelSuggestion comparator)', () => {
        const lists = { lA: makeList(['c1', 'c2', 'c3']) };
        const cards = {
            c1: makeCard('#zeta'),
            c2: makeCard('#alpha'),
            c3: makeCard('', [{ name: 'mid', color: '#000' }]),
        };

        expect(getBoardSearchTags(makeBoard(['lA']), lists, cards)).toEqual([
            '#alpha',
            '#mid',
            '#zeta',
        ]);
    });

    it('counts a name present as both a content tag and a label of the same card once', () => {
        const lists = { lA: makeList(['c1', 'c2']) };
        const cards = {
            c1: makeCard('#bug', [{ name: 'bug', color: '#000' }]),
            c2: makeCard('', [{ name: 'bug', color: '#000' }]),
        };

        expect(getBoardSearchTags(makeBoard(['lA']), lists, cards)).toEqual(['#bug']);
    });

    it('reflects the CURRENT content: a removed tag disappears immediately', () => {
        const lists = { lA: makeList(['c1']) };
        const before = { c1: makeCard('#deleted #stay') };
        const after = { c1: makeCard('just text now') };

        expect(getBoardSearchTags(makeBoard(['lA']), lists, before)).toEqual(['#deleted', '#stay']);
        // The old render-time registry kept '#deleted' suggested until an app
        // restart; extraction-on-demand tracks the store with no stale state.
        expect(getBoardSearchTags(makeBoard(['lA']), lists, after)).toEqual([]);
    });

    it('tolerates missing lists and cards (deleted mid-flight)', () => {
        const lists = { lA: makeList(['c1', 'ghost-card']), ghostList: makeList(['c2']) };
        const cards = { c1: makeCard('#real') };

        expect(getBoardSearchTags(makeBoard(['lA', 'ghost-list']), lists, cards)).toEqual([
            '#real',
        ]);
    });
});
