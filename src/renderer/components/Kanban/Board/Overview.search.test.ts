import { filterBoardsByKeyword } from './Overview';
import type { KanbanBoardState } from './action';

const board = (id: string, name: string, description = '') => ({
    _id: id,
    name,
    description,
    spentHours: 0,
    lists: [],
    focusedList: '',
    doneList: '',
    relatedSessions: [],
});

const boards: KanbanBoardState = {
    a: board('a', 'Alpha Board', 'Research notes'),
    b: board('b', '读书计划'),
    c: board('c', 'Beta', '补充材料'),
};

const namesOf = (keyword?: string) =>
    filterBoardsByKeyword(Object.values(boards), keyword)
        .map((item) => item._id)
        .sort();

describe('filterBoardsByKeyword', () => {
    it('returns every board when the keyword is missing or blank', () => {
        expect(namesOf()).toEqual(['a', 'b', 'c']);
        expect(namesOf('')).toEqual(['a', 'b', 'c']);
        expect(namesOf('   ')).toEqual(['a', 'b', 'c']);
    });

    it('matches part of the name, ignoring case and surrounding spaces', () => {
        expect(namesOf('board')).toEqual(['a']);
        expect(namesOf('  ALPHA ')).toEqual(['a']);
    });

    it('matches the description as well, so every hit is visible on the card', () => {
        expect(namesOf('research')).toEqual(['a']);
        expect(namesOf('补充')).toEqual(['c']);
    });

    it('matches names and descriptions that are not ASCII', () => {
        expect(namesOf('读书')).toEqual(['b']);
    });

    it('returns nothing when no board matches', () => {
        expect(namesOf('missing')).toEqual([]);
    });
});
