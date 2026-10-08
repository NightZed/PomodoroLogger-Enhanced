import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GridCalendar, monthList } from './GridCalendar';

// Window anchored to the end of 2020: the overlap-avoidance in getMonthText()
// drops the "Dec" of 2019, so each month name appears exactly once and a bold
// label unambiguously identifies the highlighted month.
const till = new Date(2020, 11, 31).getTime();

const render = (highlightMonth?: number) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(
            <GridCalendar data={{}} width={800} till={till} highlightMonth={highlightMonth} />
        );
    });
    return renderer;
};

/** The column headers, i.e. the month names, skipping the weekday axis. */
const monthLabels = (renderer: TestRenderer.ReactTestRenderer) =>
    renderer.root
        .findAllByType('text')
        .filter((n) => monthList.includes(n.props.children as string))
        .map((n) => ({
            label: n.props.children as string,
            bold: n.props.style?.fontWeight === 700,
        }));

describe('GridCalendar month highlight', () => {
    it('bolds exactly the requested month', () => {
        const labels = monthLabels(render(3));
        expect(labels.filter((v) => v.bold).map((v) => v.label)).toEqual(['Mar']);
    });

    it('bolds nothing when no month is highlighted', () => {
        const labels = monthLabels(render(undefined));
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.some((v) => v.bold)).toBe(false);
    });

    it('labels December exactly once across the year boundary', () => {
        const labels = monthLabels(render(12));
        expect(labels.filter((v) => v.bold)).toEqual([{ label: 'Dec', bold: true }]);
    });
});
