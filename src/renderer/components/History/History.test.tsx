import React from 'react';
import TestRenderer, { ReactTestRendererJSON, act } from 'react-test-renderer';
import { Select } from 'antd';

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
// DualPieChart lives under src/components, not src/renderer/components: this
// path used to miss it, and the real chart then mounted and blew up as soon as
// the calendar section became visible.
jest.mock('../Visualization/WordCloud', () => ({ WordCloud: () => null }));
jest.mock('../../../components/Visualization/DualPieChart', () => ({
    DualPieChart: () => null,
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

// `toJSON()` returns a node, an array of nodes or null, and children mix in raw
// strings, so every helper below takes whatever the renderer hands back.
const texts = (node: unknown): string[] => {
    if (node == null) {
        return [];
    }

    if (typeof node === 'string') {
        return [node];
    }

    if (Array.isArray(node)) {
        return (node as unknown[]).reduce<string[]>((acc, child) => acc.concat(texts(child)), []);
    }

    const { children } = node as ReactTestRendererJSON;
    return (children ?? []).reduce<string[]>((acc, child) => acc.concat(texts(child)), []);
};

const findAll = (
    node: unknown,
    predicate: (n: ReactTestRendererJSON) => boolean
): ReactTestRendererJSON[] => {
    const result: ReactTestRendererJSON[] = [];
    const walk = (n: unknown) => {
        if (n == null || typeof n === 'string') return;
        if (Array.isArray(n)) {
            (n as unknown[]).forEach(walk);
            return;
        }
        const json = n as ReactTestRendererJSON;
        if (predicate(json)) result.push(json);
        walk(json.children);
    };
    walk(node);
    return result;
};

const spinnerCount = (node: unknown) =>
    findAll(node, (n) => String(n.props?.className ?? '').includes('ant-spin')).length;

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
        let renderer!: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(<History {...props()} />);
        });
        await flush();

        const tree = renderer.toJSON();
        expect(texts(tree).join('')).toContain('Failed to load history data');
        expect(texts(tree).join('')).toContain('Timeout 60000 ms');
        // The spinners are what used to stay on screen forever.
        expect(spinnerCount(tree)).toBe(0);

        const buttons = findAll(tree, (n) => n.type === 'button');
        expect(buttons).toHaveLength(1);
        expect(texts(buttons[0]).join('')).toBe('Retry');

        // Retrying asks again, and a success this time replaces the error.
        aggHistory().mockResolvedValue(AGG);
        await act(async () => {
            buttons[0].props.onClick();
        });
        await flush();

        expect(aggHistory()).toHaveBeenCalledTimes(2);
        expect(texts(renderer.toJSON()).join('')).not.toContain('Failed to load history data');
        renderer.unmount();
    });

    it('does not re-run the aggregation when the board map is replaced', async () => {
        aggHistory().mockResolvedValue(AGG);
        const initial = props();
        let renderer!: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(<History {...initial} />);
        });
        await flush();
        expect(aggHistory()).toHaveBeenCalledTimes(1);
        expect(spinnerCount(renderer.toJSON())).toBe(0);

        // `state.kanban.boards` is a brand new object after the Kanban page
        // fetched its boards. That used to re-run the effect, blank the page
        // back to its Loading state and query the session DB a second time.
        await act(async () => {
            renderer.update(<History {...initial} boards={{}} />);
        });
        await flush();

        expect(aggHistory()).toHaveBeenCalledTimes(1);
        expect(spinnerCount(renderer.toJSON())).toBe(0);
        expect(texts(renderer.toJSON()).join('')).not.toContain('Failed to load history data');
        renderer.unmount();
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
        let renderer!: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(<History {...props()} />);
        });
        await flush();
        return renderer;
    };

    /** The count inside PomodoroDot's <title>, e.g. "99 Pomodoros". */
    const badge = (renderer: TestRenderer.ReactTestRenderer) =>
        texts(renderer.toJSON()).find((t) => /^\d+ Pomodoros$/.test(t));

    // The filter row holds exactly three pickers: project, year, month.
    const pickers = (renderer: TestRenderer.ReactTestRenderer) =>
        renderer.root.findAllByType(Select);
    const lastCall = () => aggHistory().mock.calls[aggHistory().mock.calls.length - 1][0];

    it('opens on the whole chosen year', async () => {
        const renderer = await renderHistory();
        const year = new Date().getFullYear();

        // No month range at all: the badge and the charts cover the year, which
        // is what the view did before the month picker existed.
        expect(lastCall().periodRange).toBeUndefined();
        expect(lastCall().yearQuery.startTime).toEqual({
            $gte: new Date(year, 0, 1).getTime(),
            $lt: new Date(year + 1, 0, 1).getTime(),
        });
        expect(badge(renderer)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);

        const [, yearPicker, monthPicker] = pickers(renderer);
        expect(yearPicker.props.value).toBe(year);
        expect(monthPicker.props.value).toBe('all');
        // Nothing is singled out on the heat map, which still spans the year.
        expect(calendarProps.till).toBe(new Date(year, 11, 31).getTime());
        expect(calendarProps.shownWeeks).toBeUndefined();
        expect(calendarProps.highlightMonth).toBeUndefined();
        renderer.unmount();
    });

    it('re-aggregates for the month that gets picked', async () => {
        const renderer = await renderHistory();
        const year = new Date().getFullYear();
        await act(async () => {
            pickers(renderer)[2].props.onChange(3);
        });
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
        renderer.unmount();
    });

    it('handles December rolling over into the next year', async () => {
        const renderer = await renderHistory();
        const year = new Date().getFullYear();
        await act(async () => {
            pickers(renderer)[2].props.onChange(12);
        });
        await flush();

        expect(lastCall().periodRange).toEqual({
            from: new Date(year, 11, 1).getTime(),
            to: new Date(year + 1, 0, 1).getTime(),
        });
        renderer.unmount();
    });

    it('drops the month filter and greys the picker out under All time', async () => {
        const renderer = await renderHistory();
        await act(async () => {
            pickers(renderer)[1].props.onChange('all');
        });
        await flush();

        expect(lastCall().periodRange).toBeUndefined();
        expect(lastCall().yearQuery.startTime).toBeUndefined();
        expect(pickers(renderer)[2].props.disabled).toBe(true);
        expect(calendarProps.highlightMonth).toBeUndefined();
        renderer.unmount();
    });

    it('goes back to the whole year when the month picker is set to All', async () => {
        const renderer = await renderHistory();
        const year = new Date().getFullYear();
        expect(badge(renderer)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);

        await act(async () => {
            pickers(renderer)[2].props.onChange(4);
        });
        await flush();
        expect(lastCall().periodRange).toEqual({
            from: new Date(year, 3, 1).getTime(),
            to: new Date(year, 4, 1).getTime(),
        });
        expect(badge(renderer)).toBe(`${MONTH_COUNT} Pomodoros`);

        await act(async () => {
            pickers(renderer)[2].props.onChange('all');
        });
        await flush();

        // The badge and the charts cover the year again, which is what the view
        // did before the month picker existed. This period was already seen, so
        // it comes straight from the cache rather than a fresh query.
        expect(badge(renderer)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);
        expect(aggHistory()).toHaveBeenCalledTimes(2);
        // Nothing is singled out, and the picker stays enabled for a real year.
        expect(pickers(renderer)[2].props.disabled).toBe(false);
        expect(pickers(renderer)[2].props.value).toBe('all');
        expect(calendarProps.highlightMonth).toBeUndefined();
        expect(calendarProps.till).toBe(new Date(year, 11, 31).getTime());
        renderer.unmount();
    });

    it('round-trips All -> month -> All -> month without losing the number', async () => {
        const renderer = await renderHistory();
        const year = new Date().getFullYear();
        const july = {
            from: new Date(year, 6, 1).getTime(),
            to: new Date(year, 7, 1).getTime(),
        };
        const choose = async (v: any) => {
            await act(async () => {
                pickers(renderer)[2].props.onChange(v);
            });
            await flush();
        };

        await choose(7);
        expect(lastCall().periodRange).toEqual(july);
        expect(badge(renderer)).toBe(`${MONTH_COUNT} Pomodoros`);
        await choose('all');
        expect(badge(renderer)).toBe(`${WHOLE_YEAR_COUNT} Pomodoros`);
        // Guards the `Number('all') === NaN` trap: the picker hands the raw
        // option value back, so a month after `All` has to parse as a number.
        await choose(7);
        expect(lastCall().periodRange).toEqual(july);
        expect(badge(renderer)).toBe(`${MONTH_COUNT} Pomodoros`);
        expect(calendarProps.highlightMonth).toBe(7);
        renderer.unmount();
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
        let renderer!: TestRenderer.ReactTestRenderer;
        await act(async () => {
            renderer = TestRenderer.create(<History {...p} />);
        });
        await flush();

        // The project picker is the first Select in the filter row. Its JSX
        // children are `[AllProjectsOption, [option, ...]]`, so flatten a level.
        const projectPicker = renderer.root.findAllByType(Select)[0];
        const labels = ([] as any[])
            .concat(...(projectPicker.props.children as any[]))
            .map((child: any) => String(child.props.children));
        // "All Projects" stays pinned on top; the rest follow newest-created
        // first, matching the timer's FocusSelector.
        expect(labels).toEqual(['All Projects', 'Newest', 'Middle', 'Older', 'Legacy']);
        renderer.unmount();
    });
});
