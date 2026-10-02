import React from 'react';
import TestRenderer, { ReactTestRendererJSON, act } from 'react-test-renderer';

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
jest.mock('../Visualization/WordCloud', () => ({ WordCloud: () => null }));
jest.mock('../Visualization/DualPieChart', () => ({ DualPieChart: () => null }));
jest.mock('../../../components/Visualization/GridCalendar/GridCalendar', () => ({
    GridCalendar: () => null,
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
