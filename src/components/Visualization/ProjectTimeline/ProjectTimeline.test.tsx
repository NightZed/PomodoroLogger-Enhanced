import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
    buildSegments,
    formatClock,
    HOURS_IN_DAY,
    labelStepFor,
    MIN_LABEL_GAP,
    ProjectTimeline,
} from './ProjectTimeline';
import { PomodoroRecord } from '../../../renderer/monitor/type';

/** A fixed local day; June keeps the tests away from any DST boundary. */
const at = (hour: number, minute = 0) => new Date(2026, 5, 15, hour, minute).getTime();

const record = (
    startTime: number,
    spentTimeInHour: number,
    _id: string,
    boardId?: string
): PomodoroRecord => ({
    _id,
    apps: {},
    startTime,
    spentTimeInHour,
    switchTimes: 0,
    boardId,
});

const MINUTE = 1 / 60;

describe('buildSegments', () => {
    it('places each session on the day it started and orders them by start', () => {
        const segments = buildSegments([
            record(at(14, 30), 30 * MINUTE, 'afternoon'),
            record(at(9), 25 * MINUTE, 'morning'),
        ]);
        const rounded = (hours: number) => Number(hours.toFixed(6));

        expect(
            segments.map((segment) => [
                segment.record._id,
                rounded(segment.startHour),
                rounded(segment.endHour),
            ])
        ).toEqual([
            ['morning', 9, 9.416667],
            ['afternoon', 14.5, 15],
        ]);
    });

    it('keeps the real end of a session that runs past midnight', () => {
        const [segment] = buildSegments([record(at(23, 50), 30 * MINUTE, 'late')]);

        // 23:50 + 30 min = 00:20 the next day: the label needs that, only the
        // drawn width is clipped to the axis.
        expect(Number(segment.endHour.toFixed(6))).toBe(24.333333);
    });

    it('drops sessions with no recorded time instead of drawing zero-width blocks', () => {
        expect(buildSegments([record(at(9), 0, 'empty')])).toEqual([]);
    });
});

describe('labelStepFor', () => {
    it('keeps neighbouring time labels at least MIN_LABEL_GAP apart', () => {
        for (const width of [670, 700, 760, 850, 1000]) {
            const gap = (labelStepFor(width) * width) / HOURS_IN_DAY;
            expect({ width, wideEnough: gap >= MIN_LABEL_GAP }).toEqual({
                width,
                wideEnough: true,
            });
        }
    });

    it('thins the labels out as the plot narrows', () => {
        expect(labelStepFor(670)).toBeGreaterThan(labelStepFor(1000));
    });
});

describe('formatClock', () => {
    it('rounds to the minute and prints the end of the day as 24:00', () => {
        expect([formatClock(9.25), formatClock(9.5), formatClock(HOURS_IN_DAY)]).toEqual([
            '09:15',
            '09:30',
            '24:00',
        ]);
    });

    it('prints a moment after midnight on the next day, not 24:15', () => {
        expect([formatClock(24.25), formatClock(25)]).toEqual(['00:15', '01:00']);
    });
});

describe('ProjectTimeline', () => {
    const boards = { board1: { name: 'Alpha', createdTime: 1 } };

    it('renders one button per session, labelled with its project and times', () => {
        render(
            <ProjectTimeline
                records={[
                    record(at(9, 5), 25 * MINUTE, 'a', 'board1'),
                    record(at(11), 25 * MINUTE, 'b'),
                ]}
                boards={boards}
                onChooseRecord={jest.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Alpha · 09:05–09:30 · 25 min' })).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'No project · 11:00–11:25 · 25 min' })
        ).toBeTruthy();
    });

    it('labels a session that runs past midnight with its real end and length', () => {
        render(
            <ProjectTimeline
                records={[record(at(23, 50), 25 * MINUTE, 'late', 'board1')]}
                boards={boards}
                onChooseRecord={jest.fn()}
            />
        );

        // Regression: the block used to be clipped before the label was built,
        // so this read `23:50–24:00 · 10 min`.
        expect(screen.getByRole('button', { name: 'Alpha · 23:50–00:15 · 25 min' })).toBeTruthy();
    });

    it('opens the session that was clicked, not its neighbour', () => {
        const onChooseRecord = jest.fn();
        render(
            <ProjectTimeline
                records={[
                    record(at(9), 25 * MINUTE, 'first'),
                    record(at(9, 30), 25 * MINUTE, 'second'),
                ]}
                onChooseRecord={onChooseRecord}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /09:30/ }));

        expect(onChooseRecord.mock.calls[0][0]._id).toBe('second');
    });

    it('holds its space but claims no chart on a day without sessions', () => {
        render(<ProjectTimeline records={[]} onChooseRecord={jest.fn()} />);

        expect(screen.queryAllByRole('button')).toEqual([]);
        expect(screen.queryAllByRole('group')).toEqual([]);
        expect(screen.queryAllByRole('img')).toEqual([]);
    });

    it('summarises the filtered range when no date is picked', () => {
        // Eight buckets of three hours; three of them sit in the 09:00–12:00 one.
        render(<ProjectTimeline records={[]} timeOfDay={[0, 0, 1, 3, 0, 0, 0, 0]} />);

        expect(screen.queryAllByRole('button')).toEqual([]);
        expect(
            screen.getByRole('img', { name: '4.0 h in this period · busiest 09:00–12:00' })
        ).toBeTruthy();
    });

    it('stays blank when the filtered range has no sessions either', () => {
        render(<ProjectTimeline records={[]} timeOfDay={new Array(8).fill(0)} />);

        expect(screen.queryAllByRole('img')).toEqual([]);
    });

    it('summarises the day for assistive tech when the blocks cannot be clicked', () => {
        render(
            <ProjectTimeline
                records={[record(at(9), 25 * MINUTE, 'a'), record(at(17), 25 * MINUTE, 'b')]}
            />
        );

        expect(screen.queryAllByRole('button')).toEqual([]);
        expect(screen.getByRole('img', { name: '2 pomodoros · 09:00–17:25' })).toBeTruthy();
    });
});
