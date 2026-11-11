import { getBoardsForScope } from './Overview';
import type { KanbanBoardState } from './action';

const board = (id: string, hidden?: boolean) => ({
    _id: id,
    name: id,
    spentHours: 0,
    description: '',
    lists: [],
    focusedList: '',
    doneList: '',
    relatedSessions: [],
    hidden,
});

const boards: KanbanBoardState = {
    active1: board('active1'),
    hidden1: board('hidden1', true),
    active2: board('active2', false),
    hidden2: board('hidden2', true),
};

const idsOf = (showHidden: boolean) =>
    getBoardsForScope(boards, showHidden)
        .map((item) => item._id)
        .sort();

describe('getBoardsForScope', () => {
    it('lists boards that are not hidden, treating a missing flag as active', () => {
        expect(idsOf(false)).toEqual(['active1', 'active2']);
    });

    it('lists only the hidden boards when the hidden scope is selected', () => {
        expect(idsOf(true)).toEqual(['hidden1', 'hidden2']);
    });

    it('returns nothing for an empty board map', () => {
        expect(getBoardsForScope({}, false)).toEqual([]);
        expect(getBoardsForScope({}, true)).toEqual([]);
    });
});
