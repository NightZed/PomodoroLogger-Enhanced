import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('../../workers', () => ({
    workers: {
        dbWorkers: {
            sessionDB: {
                aggHistory: jest.fn(),
                find: jest.fn().mockResolvedValue([]),
            },
        },
        tokenizer: { tokenize: jest.fn().mockResolvedValue([]) },
    },
}));

// The charts draw into canvases / echarts, none of which exist under jsdom.
// TimeTreemap lives under src/components, not src/renderer/components: this
// path used to miss the chart module (when it was a renderer-local chart), and the real
// chart then mounted and blew up as soon as the calendar section became
// visible.
jest.mock('../Visualization/WordCloud', () => ({ WordCloud: () => null }));
jest.mock('../../../components/Visualization/TimeTreemap', () => ({
    TimeTreemap: () => null,
}));
// The heat map lays out an SVG grid that is of no use under jsdom, so the
// component is stubbed. `monthList` stays real: the month picker renders from it.
// The stub records its props so the tests can assert what the calendar is told.
let calendarProps: any = null;
jest.mock('../../../components/Visualization/GridCalendar/GridCalendar', () => ({
    ...jest.requireActual('../../../components/Visualization/GridCalendar/GridCalendar'),
    GridCalendar: (props: any) => {
        calendarProps = props;
        return null;
    },
}));

// antd's Select is a portal-heavy widget; the filter behaviour is what these
// tests pin down, not the dropdown. A native select keeps the option order,
// current value, disabled state and change value observable in the DOM.
jest.mock('antd', () => {
    const React = require('react');
    const actual = jest.requireActual('antd');
    const Option = ({ children, value }: any) => React.createElement('option', { value }, children);
    const Select = ({ value, onChange, disabled, className, children }: any) =>
        React.createElement(
            'select',
            {
                value: value === undefined ? '' : String(value),
                disabled,
                className,
                onChange: (event: any) => {
                    const raw = event.target.value;
                    onChange?.(raw === 'all' ? 'all' : /^\d+$/.test(raw) ? Number(raw) : raw);
                },
            },
            children
        );
    Select.Option = Option;
    return { ...actual, Select };
});

import { History } from './History';
import { AggPomodoroInfo } from './op';
import { workers } from '../../workers';

const AGG: AggPomodoroInfo = {
    agg: {
        day: { count: 1, hours: 1 },
        week: { count: 2, hours: 2 },
        month: { count: 3, hours: 3 },
    },
    total: { count: 3, usedTime: 3 },
    calendarCount: {},
    pieChart: { projectData: [{ name: 'Board One', value: 3 }], appData: [] },
    wordWeights: [],
};

const props = (): any => ({
    chosenId: undefined,
    expiringKey: '',
    boards: {},
    chooseRecord: jest.fn(),
    getCardsByBoardId: jest.fn(() => []),
    calendarBaseColor: '#000000',
    setChosenProjectId: jest.fn(),
    setExpiringKey: jest.fn(),
});

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

const pageText = (container: HTMLElement) => container.textContent ?? '';

const spinnerCount = (container: HTMLElement) => container.querySelectorAll('.ant-spin').length;

const aggHistory = () => workers.dbWorkers.sessionDB.aggHistory as unknown as jest.Mock;

describe('History (aggregation load lifecycle)', () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => {
        aggHistory().mockReset();
        // The component logs the failure; the assertions below cover the UI.
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('shows a retryable error instead of spinning forever when the query fails', async () => {
        aggHistory().mockRejectedValue(new Error('Timeout 60000 ms after message'));
        const view = render(<History {...props()} />);
        await flush();

        expect(pageText(view.container)).toContain('Failed to load history data');
        expect(pageText(view.container)).toContain('Timeout 60000 ms');
        // The spinners are what used to stay on screen forever.
        expect(spinnerCount(view.container)).toBe(0);

        const retry = screen.getByRole('button', { name: 'Retry' });
        // Retrying asks again, and a success this time replaces the error.
        aggHistory().mockResolvedValue(AGG);
        fireEvent.click(retry);
        await flush();

        expect(aggHistory()).toHaveBeenCalledTimes(2);
        expect(pageText(view.container)).not.toContain('Failed to load history data');
        view.unmount();
    });

    it('does not re-run the aggregation when the board map is replaced', async () => {
        aggHistory().mockResolvedValue(AGG);
        const initial = props();
        const view = render(<History {...initial} />);
        await flush();
        expect(aggHistory()).toHaveBeenCalledTimes(1);
        expect(spinnerCount(view.container)).toBe(0);

        // `state.kanban.boards` is a brand new object after the Kanban page
        // fetched its boards. That used to re-run the effect, blank the page
        // back to its Loading state and query the session DB a second time.
        view.rerender(<History {...initial} boards={{}} />);
        await flush();

        expect(aggHistory()).toHaveBeenCalledTimes(1);
        expect(spinnerCount(view.container)).toBe(0);
        expect(pageText(view.container)).not.toContain('Failed to load history data');
        view.unmount();
    });
});

describe('History (month filter)', () => {
    // The badge count echoes what the worker was asked for, so the rendered
    // badge tells month-narrowed (1) and whole-year (99) apart. Asserting on the
    // UI matters here: revisiting an already-seen period is served from the
    // aggregation cache, so no new worker call happens and the call log would
    // keep reporting the previous period.
    const WHOLE_YEAR_COUNT = 99;
    const MONTH_COUNT = 1;
    beforeEach(() => {
        aggHistory().mockReset();
        aggHistory().mockImplementation((arg: any) =>
            Promise.resolve({
                ...AGG,
                total: {
                    count: arg.periodRange ? MONTH_COUNT : WHOLE_YEAR_COUNT,
                    usedTime: arg.periodRange ? MONTH_COUNT : WHOLE_YEAR_COUNT,
                },
            })
        );
        calendarProps = null;
        // jsdom reports a zero-width body, which would leave `calendarWidth`
        // under the `> 670` cutoff and keep the heat map from rendering at all.
        Object.defineProperty(document.body, 'clientWidth', {
            value: 1200,
            configurable: true,
        });
    });

    const renderHistory = async () => {
        const view = render(<History {...props()} />);
        await flush();
        return view;
    };

    /** The count inside PomodoroDot's <title>, e.g. "99 Pomodoros". */
    const badge = (container: HTMLElement) => pageText(container).match(/\d+ Pomodoros/)?.[0];

    // The filter row holds exactly three pickers: project, year, month.
    const pickers = (container: HTMLElement) =>
        Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const lastCall = () => aggHistory().mock.calls[aggHistory().mock.calls.length - 1][0];

    it('opens on the whole chosen year', async () => {
        const { container } = await renderHistory();
        const year = new Date().getFullYear();

        // No month range at all: the badge and the charts cover the year, which
        // is what the view did before the month picker existed.
        expect(lastCall().periodRange).toBeUndefined();
        expect(lastCall().yearQuery.startTime).toEqual({
            $gte: new Date(year, 0, 1).getTime(),
            $lt: new Date(year + 1, 0, 1).getTime(),
        });
        expect(badge(container)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);

        const [, yearPicker, monthPicker] = pickers(container);
        expect(Number(yearPicker.value)).toBe(year);
        expect(monthPicker.value).toBe('all');
        // Nothing is singled out on the heat map, which still spans the year.
        expect(calendarProps.till).toBe(new Date(year, 11, 31).getTime());
        expect(calendarProps.shownWeeks).toBeUndefined();
        expect(calendarProps.highlightMonth).toBeUndefined();
    });

    it('re-aggregates for the month that gets picked', async () => {
        const { container } = await renderHistory();
        const year = new Date().getFullYear();
        fireEvent.change(pickers(container)[2], { target: { value: '3' } });
        await flush();

        expect(aggHistory()).toHaveBeenCalledTimes(2);
        expect(lastCall().periodRange).toEqual({
            from: new Date(year, 2, 1).getTime(),
            to: new Date(year, 3, 1).getTime(),
        });
        // The calendar is unaffected by the month choice.
        expect(lastCall().yearQuery.startTime).toEqual({
            $gte: new Date(year, 0, 1).getTime(),
            $lt: new Date(year + 1, 0, 1).getTime(),
        });
    });

    it('handles December rolling over into the next year', async () => {
        const { container } = await renderHistory();
        const year = new Date().getFullYear();
        fireEvent.change(pickers(container)[2], { target: { value: '12' } });
        await flush();

        expect(lastCall().periodRange).toEqual({
            from: new Date(year, 11, 1).getTime(),
            to: new Date(year + 1, 0, 1).getTime(),
        });
    });

    it('drops the month filter and greys the picker out under All time', async () => {
        const { container } = await renderHistory();
        fireEvent.change(pickers(container)[1], { target: { value: 'all' } });
        await flush();

        expect(lastCall().periodRange).toBeUndefined();
        expect(lastCall().yearQuery.startTime).toBeUndefined();
        expect(pickers(container)[2].disabled).toBe(true);
        expect(pickers(container)[2].className).toBe('history-month-filter');
        expect(calendarProps.highlightMonth).toBeUndefined();
    });

    it('goes back to the whole year when the month picker is set to All', async () => {
        const { container } = await renderHistory();
        const year = new Date().getFullYear();
        expect(badge(container)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);

        fireEvent.change(pickers(container)[2], { target: { value: '4' } });
        await flush();
        expect(lastCall().periodRange).toEqual({
            from: new Date(year, 3, 1).getTime(),
            to: new Date(year, 4, 1).getTime(),
        });
        expect(badge(container)).toBe(`${MONTH_COUNT} Pomodoros`);

        fireEvent.change(pickers(container)[2], { target: { value: 'all' } });
        await flush();

        // The badge and the charts cover the year again, which is what the view
        // did before the month picker existed. This period was already seen, so
        // it comes straight from the cache rather than a fresh query.
        expect(badge(container)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);
        expect(aggHistory()).toHaveBeenCalledTimes(2);
        // Nothing is singled out, and the picker stays enabled for a real year.
        expect(pickers(container)[2].disabled).toBe(false);
        expect(pickers(container)[2].value).toBe('all');
        expect(calendarProps.highlightMonth).toBeUndefined();
        expect(calendarProps.till).toBe(new Date(year, 11, 31).getTime());
    });

    it('round-trips All -> month -> All -> month without losing the number', async () => {
        const { container } = await renderHistory();
        const year = new Date().getFullYear();
        const july = {
            from: new Date(year, 6, 1).getTime(),
            to: new Date(year, 7, 1).getTime(),
        };
        const choose = async (value: string) => {
            fireEvent.change(pickers(container)[2], { target: { value } });
            await flush();
        };

        await choose('7');
        expect(lastCall().periodRange).toEqual(july);
        expect(badge(container)).toBe(`${MONTH_COUNT} Pomodoros`);
        await choose('all');
        expect(badge(container)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);
        // Guards the `Number('all') === NaN` trap: the picker hands the raw
        // option value back, so a month after `All` has to parse as a number.
        await choose('7');
        expect(lastCall().periodRange).toEqual(july);
        expect(badge(container)).toBe(`${MONTH_COUNT} Pomodoros`);
        expect(calendarProps.highlightMonth).toBe(7);
    });
});

describe('History (project filter order)', () => {
    beforeEach(() => {
        aggHistory().mockReset();
        aggHistory().mockResolvedValue(AGG);
    });

    it('lists projects newest-created first with legacy boards last', async () => {
        // Boards arrive from the DB in insertion order; the dropdown has to
        // re-order them by creation time. `createdTime` is optional, so a
        // legacy board without one sorts as the oldest.
        const board = (name: string, createdTime?: number): any => ({
            _id: `id-${name}`,
            name,
            createdTime,
        });
        const p = props();
        p.boards = {
            older: board('Older', 1000),
            newest: board('Newest', 3000),
            middle: board('Middle', 2000),
            legacy: board('Legacy'),
        };
        const view = render(<History {...p} />);
        await flush();

        // The project picker is the first Select in the filter row.
        const projectPicker = view.container.querySelector('select') as HTMLSelectElement;
        const labels = Array.from(projectPicker.querySelectorAll('option')).map((option) =>
            String(option.textContent)
        );
        // "All Projects" stays pinned on top; the rest follow newest-created
        // first, matching the timer's FocusSelector.
        expect(labels).toEqual(['All Projects', 'Newest', 'Middle', 'Older', 'Legacy']);
        view.unmount();
    });
});
