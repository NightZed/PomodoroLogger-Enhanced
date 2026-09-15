import { DataMerger, SourceData } from '../dataMerger';
import { case0 } from './case0';
import { case1 } from './case1';
import { case2 } from './case2';
import { case3 } from './case3';
import { KanbanBoard } from '../../../renderer/components/Kanban/type';

const emptyData = (board?: KanbanBoard): SourceData => ({
    boards: board ? { [board._id]: board } : {},
    cards: {},
    lists: {},
    move: [],
    records: [],
});

const legacyBoard = (createdTime?: number): KanbanBoard => {
    const board: KanbanBoard = {
        _id: 'board',
        name: 'board',
        description: '',
        lists: [],
        focusedList: '',
        doneList: '',
        relatedSessions: [],
        spentHours: 0,
    };
    if (createdTime !== undefined) {
        board.createdTime = createdTime;
    }

    return board;
};

describe('Data Merger', () => {
    it('merges case 0', () => {
        const merger = new DataMerger();
        const output = merger.merge(case0.a, case0.b);
        expect(output).toStrictEqual(case0.expected);
    });
    it('merges case 1', () => {
        const merger = new DataMerger();
        const output = merger.merge(case1.a, case1.b);
        expect(output).toStrictEqual(case1.expected);
    });

    it('merges case 2', () => {
        const merger = new DataMerger();
        const output = merger.merge(case2.a, case2.b);
        expect(output).toStrictEqual(case2.expected);
    });

    it('merges case 3 (labels)', () => {
        const merger = new DataMerger();
        const output = merger.merge(case3.a, case3.b);
        expect(output).toStrictEqual(case3.expected);
    });

    it('keeps the earliest createdTime when merging two sides that both have one', () => {
        const merger = new DataMerger();
        const output = merger.merge(emptyData(legacyBoard(5000)), emptyData(legacyBoard(3000)));
        expect(output.boards.board.createdTime).toBe(3000);
    });

    it('takes createdTime from the other side when the base board has none', () => {
        const merger = new DataMerger();
        const output = merger.merge(emptyData(legacyBoard()), emptyData(legacyBoard(7000)));
        expect(output.boards.board.createdTime).toBe(7000);
    });

    it('keeps the base createdTime when the other side has none', () => {
        const merger = new DataMerger();
        const output = merger.merge(emptyData(legacyBoard(4000)), emptyData(legacyBoard()));
        expect(output.boards.board.createdTime).toBe(4000);
    });
});
