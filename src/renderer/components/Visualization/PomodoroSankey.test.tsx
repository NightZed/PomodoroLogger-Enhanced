import React from 'react';
import { render } from '@testing-library/react';
import { EfficiencyAnalyser } from '../../../shared/efficiency/efficiency';
import type { PomodoroRecord } from '../../monitor/type';
import { PomodoroSankey } from './PomodoroSankey';

/**
 * The chart itself is canvas work that jsdom cannot do, so `ReactEcharts` is
 * replaced by a recorder: the option it receives is what the tooltip
 * formatters under test live in.
 */
let mockOption: any;

jest.mock('echarts-for-react', () => ({
    __esModule: true,
    default: (props: { option: unknown }) => {
        mockOption = props.option;
        return null;
    },
}));

interface TooltipNode {
    name: string;
    tooltip?: { formatter: (params: any) => string };
}

function recordWith(entries: { title: string; seconds: number }[]): PomodoroRecord {
    const titleSpentTime: PomodoroRecord['apps'][string]['titleSpentTime'] = {};
    entries.forEach((entry, index) => {
        titleSpentTime[entry.title] = {
            index,
            occurrence: 1,
            normalizedWeight: entries.length,
        };
    });

    return {
        _id: 'session-1',
        apps: {
            chrome: {
                appName: 'chrome',
                spentTimeInHour: 0.01,
                titleSpentTime,
            },
        },
        spentTimeInHour: 0.01,
        switchTimes: entries.length,
        startTime: 1700000000000,
        stayTimeInSecond: entries.map((entry) => entry.seconds),
        switchActivities: entries.map((_, index) => index),
    };
}

/** Renders the chart and returns the nodes that carry a tooltip formatter. */
function tooltipNodes(record: PomodoroRecord): TooltipNode[] {
    mockOption = undefined;
    const view = render(
        <PomodoroSankey
            record={record}
            efficiencyAnalyser={new EfficiencyAnalyser([])}
            showSwitch={false}
        />
    );
    expect(view.container).not.toBeNull();

    const nodes = mockOption.series[0].data as TooltipNode[];
    return nodes.filter((node) => node.tooltip !== undefined);
}

describe('PomodoroSankey tooltips', () => {
    // Regression: `get-windows` reports an empty title for some windows, and
    // that key reached the chart as a node named ''. The old formatter read a
    // falsy name as "this is a link", took `params.data.value` from a node
    // (which has none) and threw `undefined.toFixed()` inside ECharts'
    // mousemove handler -- one line in crash.log per pointer move, and no
    // tooltip.
    it('formats a node whose window title is empty', () => {
        const nodes = tooltipNodes(
            recordWith([
                { title: '', seconds: 120 },
                { title: 'Docs', seconds: 30 },
            ])
        );

        const untitled = nodes.find((node) => node.name === '(Untitled)');
        expect(untitled).toBeDefined();
        expect(untitled!.tooltip!.formatter({ dataType: 'node', data: untitled })).toBe(
            '(Untitled): 120'
        );

        // Every formatter has to survive a node-shaped payload, whatever the
        // title behind it looks like.
        for (const node of nodes) {
            expect(() => node.tooltip!.formatter({ dataType: 'node', data: node })).not.toThrow();
        }
    });

    it('labels a titled node with the untruncated title and its stay time', () => {
        const nodes = tooltipNodes(recordWith([{ title: 'Docs', seconds: 30 }]));
        const docs = nodes.find((node) => node.name === 'Docs');
        expect(docs).toBeDefined();
        expect(docs!.tooltip!.formatter({ dataType: 'node', data: docs })).toBe('Docs: 30');
    });

    it('still formats link-shaped params, one decimal place', () => {
        const nodes = tooltipNodes(recordWith([{ title: 'Docs', seconds: 30 }]));
        const docs = nodes.find((node) => node.name === 'Docs');
        expect(
            docs!.tooltip!.formatter({
                dataType: 'edge',
                data: { source: 'Chrome', target: 'Docs', value: 12.345 },
            })
        ).toBe('Chrome --- Docs: 12.3');
    });
});
