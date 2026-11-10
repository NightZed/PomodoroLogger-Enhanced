/**
 * What the History view puts in its "Unknown" bucket, reported at import time.
 *
 * The two buckets must stay in step with `aggPomodoro.ts`: a session with no
 * `boardId`, and a session whose `boardId` is not in the board table. Anything
 * else is a real project and must not be reported.
 */
import { analyzeUnknownProjects, describeUnknownProjects } from '../unknownProjects';
import type { PomodoroRecord } from '../../../renderer/monitor/type';

const record = (over: Partial<PomodoroRecord> = {}): PomodoroRecord => ({
    _id: 'r1',
    apps: {},
    spentTimeInHour: 0.5,
    switchTimes: 0,
    startTime: 1000,
    ...over,
});

describe('analyzeUnknownProjects', () => {
    it('reports sessions without a board id', () => {
        const report = analyzeUnknownProjects(
            [record({ _id: 'a' }), record({ _id: 'b', boardId: '' })],
            {}
        );

        expect(report.total).toBe(2);
        expect(report.noBoardId).toBe(2);
        expect(report.danglingBoardId).toBe(0);
        expect(report.lines).toEqual([
            'records["a"] boardId missing startTime=1000 spent=0.50h',
            'records["b"] boardId missing startTime=1000 spent=0.50h',
        ]);
    });

    it('reports board ids that are not in the merged board table', () => {
        const report = analyzeUnknownProjects(
            [
                record({ _id: 'a', boardId: 'gone' }),
                record({ _id: 'b', boardId: 'gone' }),
                record({ _id: 'c', boardId: 'other' }),
            ],
            {}
        );

        expect(report.total).toBe(3);
        expect(report.danglingBoardId).toBe(3);
        expect(report.noBoardId).toBe(0);
        // Most frequent first, so the headline names the worst offender.
        expect(report.danglingIds).toEqual([
            ['gone', 2],
            ['other', 1],
        ]);
        expect(report.lines[0]).toBe(
            'records["a"] boardId="gone" not in boards startTime=1000 spent=0.50h'
        );
    });

    it('ignores sessions whose board exists, even when the board has no name', () => {
        // `boardNames[id] ?? 'Unknown'` only falls back on a missing entry; an
        // empty name renders as a blank block, which is a different problem.
        const report = analyzeUnknownProjects([record({ boardId: 'b1' }), record({ _id: 'r2' })], {
            b1: { _id: 'b1', name: '' },
        });

        expect(report.total).toBe(1);
        expect(report.noBoardId).toBe(1);
        expect(report.danglingBoardId).toBe(0);
    });

    it('sums hours over the flagged sessions only', () => {
        const report = analyzeUnknownProjects(
            [
                record({ spentTimeInHour: 0.25 }),
                record({ _id: 'r2', boardId: 'b1', spentTimeInHour: 9 }),
                record({ _id: 'r3', boardId: 'gone', spentTimeInHour: 0.75 }),
            ],
            { b1: { _id: 'b1', name: 'Work' } }
        );

        expect(report.hours).toBe(1);
    });

    it('caps the detail lines but keeps the real total', () => {
        const records = Array.from({ length: 520 }, (_, i) => record({ _id: `r${i}` }));
        const report = analyzeUnknownProjects(records, {});

        expect(report.total).toBe(520);
        expect(report.lines).toHaveLength(500);
    });

    it('reports nothing for data that is already healthy', () => {
        const report = analyzeUnknownProjects([record({ boardId: 'b1' })], {
            b1: { _id: 'b1', name: 'Work' },
        });

        expect(report.total).toBe(0);
        expect(report.lines).toEqual([]);
        expect(describeUnknownProjects(report)).toBe('total=0 noBoardId=0 dangling=0 hours=0.00');
    });
});

describe('describeUnknownProjects', () => {
    it('names the dangling ids and summarises the rest', () => {
        const records = Array.from({ length: 12 }, (_, i) =>
            record({ _id: `r${i}`, boardId: `b${i}` })
        );
        const text = describeUnknownProjects(analyzeUnknownProjects(records, {}));

        expect(text).toBe(
            'total=12 noBoardId=0 dangling=12 hours=6.00 ids="b0:1,b1:1,b2:1,b3:1,b4:1,b5:1,b6:1,b7:1,b8:1,b9:1,+2 more"'
        );
    });
});
