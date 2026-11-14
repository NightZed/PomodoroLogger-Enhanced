import { aggregateBoardRows } from './tableAggregation';

/**
 * The table used to run this aggregation during render and write `isDone` onto
 * every Redux card object. That both mutated the store and made sorting the
 * table re-walk all cards. Keep the pure function covered.
 */
describe('aggregateBoardRows', () => {
    it('reports the board total, not the sum of its cards', () => {
        const openCard = {
            _id: 'open-card',
            content: 'open',
            labels: [],
            spentTimeInHour: { estimated: 2, actual: 1 },
        };
        const doneCard = {
            _id: 'done-card',
            content: 'done',
            labels: [],
            spentTimeInHour: { estimated: 2, actual: 1 },
        };
        const boards = {
            board: {
                _id: 'board',
                name: 'Board',
                lists: ['open-list', 'done-list'],
                doneList: 'done-list',
                relatedSessions: [{}, {}],
                // Three hours of sessions on this board: the two cards carry
                // one each, and the third pomodoro was never assigned to a
                // card. The cards alone would report 2h.
                spentHours: 3,
            },
        };
        const lists = {
            'open-list': { _id: 'open-list', cards: ['open-card'] },
            'done-list': { _id: 'done-list', cards: ['done-card'] },
        };
        const cards = {
            'open-card': openCard,
            'done-card': doneCard,
        };

        const rows = aggregateBoardRows(boards as any, lists as any, cards as any);

        expect(rows).toEqual([
            {
                _id: 'board',
                name: 'Board',
                estimatedLeftTimeSum: 1,
                actualTimeSum: 3,
                meanPercentageError: 100,
                pomodoroCount: 2,
            },
        ]);
        expect((openCard as any).isDone).toBeUndefined();
        expect((doneCard as any).isDone).toBeUndefined();
    });

    it('ignores dangling list and card references', () => {
        const boards = {
            board: {
                _id: 'board',
                name: 'Board',
                lists: ['missing-list', 'list'],
                doneList: 'list',
                relatedSessions: [],
                spentHours: 0,
            },
        };
        const lists = {
            list: { _id: 'list', cards: ['missing-card'] },
        };

        const rows = aggregateBoardRows(boards as any, lists as any, {});

        expect(rows[0]).toMatchObject({
            estimatedLeftTimeSum: 0,
            actualTimeSum: 0,
            meanPercentageError: undefined,
            pomodoroCount: 0,
        });
    });
});
