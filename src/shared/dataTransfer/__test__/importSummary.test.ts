import { analyzeImport, buildImportLogGroups } from '../importSummary';
import type { SourceData } from '../../dataMerger/dataMerger';
import type { Card, KanbanBoard, List } from '../../../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../../../renderer/monitor/type';

const card = (id: string, sessionIds: string[] = [], actual = 0): Card => ({
    _id: id,
    title: id,
    content: '',
    sessionIds,
    spentTimeInHour: { estimated: 0, actual },
});

const list = (id: string, cards: string[]): List => ({ _id: id, title: id, cards });

const board = (id: string, lists: string[]): KanbanBoard => ({
    _id: id,
    name: id,
    description: '',
    lists,
    focusedList: lists[0] ?? '',
    doneList: '',
    relatedSessions: [],
    spentHours: 0,
});

const record = (id: string, over: Partial<PomodoroRecord> = {}): PomodoroRecord =>
    ({
        _id: id,
        startTime: 1_700_000_000_000,
        boardId: 'b1',
        spentTimeInHour: 0.25,
        switchTimes: 1,
        screenStaticDuration: 0,
        apps: { Chrome: {} },
        switchActivities: [],
        ...over,
    }) as PomodoroRecord;

/**
 * b1/l1 is live and holds c1. l2 is an orphan list holding c2 and c4; c3 is in
 * no list. c1 names a live session and a dead one; the orphan cards also name
 * a dead one, which the data check does not report until they are restored.
 */
const seed = (): SourceData => ({
    boards: { b1: board('b1', ['l1']) },
    lists: {
        l1: list('l1', ['c1']),
        l2: list('l2', ['c2', 'c4']),
    },
    cards: {
        c1: card('c1', ['s1', 'goneSession'], 0.25),
        c2: card('c2', ['goneSession']),
        c3: card('c3'),
        c4: card('c4'),
    },
    move: [
        { cardId: 'goneCard', fromListId: 'l1', toListId: 'l2', time: 2 },
        { cardId: 'c1', fromListId: 'l1', toListId: 'goneList', time: 3 },
    ],
    records: [
        record('s1'),
        record('s2', { boardId: 'goneBoard' }),
        record('s3', { boardId: undefined }),
    ],
});

const formatTime = (time: number): string => `T${time}`;

describe('import summary', () => {
    it('counts what the merge left behind, using the data check rules', () => {
        const summary = analyzeImport(seed(), [{ cardId: 'c3', listId: 'l1' }]);

        expect(summary.counts).toEqual({
            // c2 and c4 are only named by the orphan list l2; c3 is in none.
            cardsOutsideLists: 3,
            deadMoves: 2,
            // Only c1 is inside a live list; the orphan cards are handled when
            // they are restored or deleted.
            danglingSessions: 1,
            unknownBoard: 1,
            noBoard: 1,
            rehomed: 1,
        });
    });

    it('writes one group per kind, with only fields that exist', () => {
        const groups = buildImportLogGroups(seed(), [{ cardId: 'c3', listId: 'l1' }], formatTime);
        const byTitle = new Map(groups.map((group) => [group.title, group]));

        expect(byTitle.get('cards not in any list (3)')?.lines).toEqual([
            'card=c2 title="c2" spent=0.00h sessions=1 state=detached list="l2"',
            'card=c3 title="c3" spent=0.00h sessions=0 state=orphan',
            'card=c4 title="c4" spent=0.00h sessions=0 state=detached list="l2"',
        ]);

        expect(byTitle.get('dead move records (2)')?.lines).toEqual([
            'card=goneCard from=l1 to=l2 time=T2',
            'card=c1 title="c1" from=l1 to=goneList time=T3',
        ]);

        // A dangling session has no row left, so no start time, duration or app
        // count can be printed for it.
        expect(byTitle.get('dangling session references (1)')?.lines).toEqual([
            'card=c1 title="c1" session=goneSession',
        ]);

        expect(byTitle.get('unknown projects - deleted board (1)')?.lines).toEqual([
            'session=s2 board=goneBoard start=T1700000000000 spent=0.25h apps=1',
        ]);
        expect(byTitle.get('unknown projects - no project (1)')?.lines).toEqual([
            'session=s3 start=T1700000000000 spent=0.25h apps=1',
        ]);
        expect(byTitle.get('cards rehomed by move records (1)')?.lines).toEqual([
            'card=c3 title="c3" list=l1 by=move',
        ]);
    });

    it('caps each group at 500 lines and reports the rest', () => {
        const data = seed();
        data.move = Array.from({ length: 501 }, (_, index) => ({
            cardId: `gone-${index}`,
            fromListId: 'l1',
            toListId: 'l2',
            time: index,
        }));

        const groups = buildImportLogGroups(data, [], formatTime);
        const moves = groups.find((group) => group.title.startsWith('dead move records'));

        expect(moves?.title).toBe('dead move records (501, showing 500)');
        expect(moves?.lines).toHaveLength(500);
        expect(moves?.more).toBe(1);
    });

    it('omits groups with nothing to report', () => {
        const groups = buildImportLogGroups(
            {
                boards: {},
                lists: {},
                cards: {},
                move: [],
                records: [],
            },
            [],
            formatTime
        );

        expect(groups).toEqual([]);
    });
});
