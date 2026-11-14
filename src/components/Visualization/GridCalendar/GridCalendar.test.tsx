import React from 'react';
import { render } from '@testing-library/react';
import { getHoverInfo, GridCalendar, monthList } from './GridCalendar';

// Window anchored to the end of 2020: the overlap-avoidance in getMonthText()
// drops the "Dec" of 2019, so each month name appears exactly once and a bold
// label unambiguously identifies the highlighted month.
const till = new Date(2020, 11, 31).getTime();

const renderCalendar = (highlightMonth?: number) =>
    render(<GridCalendar data={{}} width={800} till={till} highlightMonth={highlightMonth} />)
        .container;

/** The column headers, i.e. the month names, skipping the weekday axis. */
const monthLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('text'))
        .filter((n) => monthList.includes(n.textContent as string))
        .map((n) => ({
            label: n.textContent as string,
            bold: n.style.fontWeight === '700',
        }));

describe('GridCalendar hover', () => {
    it('rounds a boundary total before printing one decimal', () => {
        // 27 × 25 minutes sums to 11.249999999999998; the treemap prints 11.3
        // for the same day, so the calendar must not print 11.2.
        expect(getHoverInfo({ count: 27, spentHours: 11.249999999999998 } as any)).toBe(
            '27 pomodoros (11.3h) '
        );
    });

    it('keeps a genuine half hour down', () => {
        expect(getHoverInfo({ count: 1, spentHours: 1.24 } as any)).toBe('1 pomodoros (1.2h) ');
    });
});

describe('GridCalendar month highlight', () => {
    it('bolds exactly the requested month', () => {
        const labels = monthLabels(renderCalendar(3));
        expect(labels.filter((v) => v.bold).map((v) => v.label)).toEqual(['Mar']);
    });

    it('bolds nothing when no month is highlighted', () => {
        const labels = monthLabels(renderCalendar(undefined));
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.some((v) => v.bold)).toBe(false);
    });

    it('labels December exactly once across the year boundary', () => {
        const labels = monthLabels(renderCalendar(12));
        expect(labels.filter((v) => v.bold)).toEqual([{ label: 'Dec', bold: true }]);
    });
});
