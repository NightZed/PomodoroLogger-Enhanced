import React from 'react';
import { act, render } from '@testing-library/react';

// The real wrapper imports echarts at runtime, which cannot render under
// jsdom; the stub captures the props so the click wiring can be asserted.
let capturedProps: any = null;
jest.mock('echarts-for-react', () => ({
    __esModule: true,
    default: (props: any) => {
        capturedProps = props;
        return null;
    },
}));

import {
    getOption,
    getSquareRatio,
    Props,
    PROJECT_SERIES_NAME,
    APP_SERIES_NAME,
    APPLICATIONS_OTHER_NAME,
    BLOCK_RADIUS,
    TimeTreemap,
} from './TimeTreemap';
import { dayTokens, nightTokens } from '../../../renderer/theme/tokens';

const props = (overrides: Partial<Props> = {}): Props => ({
    projectData: [
        { name: 'Board A', value: 30 },
        { name: 'Board B', value: 10 },
    ],
    appData: [
        { name: 'Code', value: 25 },
        { name: 'Browser', value: 15 },
    ],
    ...overrides,
});

const PROJECT_TOTAL = 40;
const APP_TOTAL = 40;

describe('TimeTreemap option', () => {
    it('lays the two treemap panels side by side filling the canvas', () => {
        const option = getOption(props(), dayTokens) as any;

        expect(option.series).toHaveLength(2);
        const [projects, apps] = option.series;
        expect(projects.type).toBe('treemap');
        expect(projects.name).toBe(PROJECT_SERIES_NAME);
        expect(projects.animation).toBe(true);
        expect(projects.animationDuration).toBe(100);
        expect(projects.animationDurationUpdate).toBe(500);
        expect(projects.animationEasing).toBe('cubicOut');
        expect(projects.levels[1].color.length).toBeGreaterThan(1);
        expect(apps.levels[1].color.length).toBeGreaterThan(1);
        const nightOption = getOption(props(), nightTokens) as any;
        expect(projects.levels[0].color).not.toEqual(nightOption.series[0].levels[0].color);
        expect(projects.levels[0].color).toEqual(projects.levels[1].color);
        expect(apps.levels[0].color).toEqual(apps.levels[1].color);
        expect(apps.type).toBe('treemap');
        expect(apps.name).toBe(APP_SERIES_NAME);
        expect(projects.squareRatio).toBeGreaterThan(1);
        expect(apps.squareRatio).toBeGreaterThan(1);
        // Both panels span the full height; the right one starts where the
        // left one ends (PANEL_DIVIDE), so no space is wasted.
        expect(projects.left).toBe(0);
        expect(projects.right).toBe('51%');
        expect(apps.left).toBe('51%');
        expect(apps.right).toBe(0);
        for (const series of option.series) {
            expect(series.bottom).toBe(0);
            // Rounded blocks; the radius sits above the 1px seam so corners
            // still read as round against the page-colored gap.
            expect(series.itemStyle.borderWidth).toBe(1);
            expect(series.itemStyle.borderRadius).toBe(BLOCK_RADIUS);
            // Not an explorable tree: no pan/zoom/breadcrumb on a stats panel.
            expect(series.roam).toBe(false);
            expect(series.nodeClick).toBe(false);
            expect(series.breadcrumb).toEqual({ show: false });
        }
    });

    it('titles each panel with its total hours', () => {
        const option = getOption(props(), nightTokens) as any;

        expect(option.title[0].text).toBe('Projects');
        expect(option.title[0].subtext).toBe(`${PROJECT_TOTAL.toFixed(1)} h`);
        expect(option.title[1].text).toBe('Applications');
        expect(option.title[1].subtext).toBe(`${APP_TOTAL.toFixed(1)} h`);
        // Canvas text cannot resolve var(), so real token colors are used.
        expect(option.title[0].textStyle.color).toBe(nightTokens.text);
        expect(option.title[0].subtextStyle.color).toBe(nightTokens.textSecondary);
    });

    it('labels each block with its hours and share of the panel total', () => {
        const option = getOption(props(), dayTokens) as any;
        const projectLabel = option.series[0].label.formatter;
        const appLabel = option.series[1].label.formatter;

        expect(option.series[0].label.lineHeight).toBe(16);
        expect(option.series[1].label.lineHeight).toBe(16);
        expect(projectLabel({ name: 'Board A', value: 30 })).toBe('Board A\n30.0 h (75.0%)');
        expect(projectLabel({ name: 'Board B', value: 10 })).toBe('Board B\n10.0 h (25.0%)');
        expect(appLabel({ name: 'Code', value: 25 })).toBe('Code\n25.0 h (62.5%)');
    });

    it('computes the label percent against each panel’s own total', () => {
        // Both panels happen to total 40 h in `props()`; make them differ so
        // a formatter that mixed the two totals would fail.
        const option = getOption(
            props({ projectData: [{ name: 'Solo', value: 20 }] }),
            dayTokens
        ) as any;
        const projectLabel = option.series[0].label.formatter;
        const appLabel = option.series[1].label.formatter;

        expect(projectLabel({ name: 'Solo', value: 20 })).toBe('Solo\n20.0 h (100.0%)');
        expect(appLabel({ name: 'Code', value: 25 })).toBe('Code\n25.0 h (62.5%)');
    });

    it('tolerates dimension-array values from the treemap tree', () => {
        const option = getOption(props(), dayTokens) as any;

        expect(option.series[0].label.formatter({ name: 'Board A', value: [30] })).toBe(
            'Board A\n30.0 h (75.0%)'
        );
    });

    it('shows hours and percent in the tooltip against the right panel total', () => {
        const option = getOption(
            props({ projectData: [{ name: 'Solo', value: 20 }] }),
            dayTokens
        ) as any;
        const { formatter } = option.tooltip;

        // seriesIndex 0 = projects (total 20), 1 = apps (total 40).
        expect(formatter({ seriesIndex: 0, name: 'Solo', value: 20, marker: 'mk' })).toBe(
            'mkSolo: 20 h (100.0%)'
        );
        expect(formatter({ seriesIndex: 1, name: 'Code', value: 25, marker: 'mk' })).toBe(
            'mkCode: 25 h (62.5%)'
        );
    });

    it('renders no percent noise on an empty dataset', () => {
        const option = getOption(props({ projectData: [], appData: [] }), dayTokens) as any;

        expect(option.series[0].data).toEqual([]);
        expect(option.title[0].subtext).toBe('0.0 h');
        // 0/0 would be NaN; the shared guard reports 0 instead.
        expect(option.tooltip.formatter({ seriesIndex: 0, name: 'x', value: 0 })).toContain(
            '(0.0%)'
        );
    });

    it('keeps all blocks, including very small ones', () => {
        const data = [
            { name: 'Large', value: 90 },
            { name: 'Small A', value: 1 },
            { name: 'Small B', value: 1 },
        ];

        const option = getOption({ ...props(), projectData: data }, dayTokens) as any;
        expect(option.series[0].data).toEqual(data);
        expect(option.series[1].data).toEqual(props().appData);
    });

    it('merges only small application blocks into English Others', () => {
        const apps = [
            { name: 'Large App', value: 90 },
            { name: 'Small App A', value: 1 },
            { name: 'Small App B', value: 1 },
        ];
        const option = getOption({ ...props(), appData: apps }, dayTokens) as any;

        expect(option.series[0].data).toEqual(props().projectData);
        expect(option.series[1].data).toEqual([
            { name: 'Large App', value: 90 },
            { name: APPLICATIONS_OTHER_NAME, value: 2 },
        ]);
    });

    it('expands the application Others block inside its original node', () => {
        const apps = [
            { name: 'Large App', value: 90 },
            { name: 'Small App A', value: 1 },
            { name: 'Small App B', value: 1 },
        ];
        const option = getOption(
            { ...props(), appData: apps, showAllApplications: true },
            dayTokens
        ) as any;

        expect(option.series[1].data).toEqual([
            {
                name: 'Large App',
                value: 90,
            },
            {
                name: APPLICATIONS_OTHER_NAME,
                value: 2,
                children: [
                    { name: 'Small App A', value: 1 },
                    { name: 'Small App B', value: 1 },
                ],
            },
        ]);
    });

    it('reduces the horizontal bias when one item dominates', () => {
        const balanced = getSquareRatio(
            [
                { name: 'A', value: 50 },
                { name: 'B', value: 50 },
            ],
            400,
            300
        );
        const dominant = getSquareRatio(
            [
                { name: 'A', value: 90 },
                { name: 'B', value: 10 },
            ],
            400,
            300
        );

        expect(balanced).toBeGreaterThan(dominant);
        expect(dominant).toBeGreaterThanOrEqual(1.15);
    });
});

describe('TimeTreemap click wiring', () => {
    beforeEach(() => {
        capturedProps = null;
    });

    it('forwards project block clicks to onProjectClick', () => {
        const onProjectClick = jest.fn();
        render(<TimeTreemap {...props({ onProjectClick })} />);

        act(() => {
            capturedProps.onEvents.click({ seriesIndex: 0, name: 'Board A' });
        });
        expect(onProjectClick).toHaveBeenCalledWith('Board A');
    });

    it('ignores app block clicks: only projects filter the view', () => {
        const onProjectClick = jest.fn();
        render(<TimeTreemap {...props({ onProjectClick })} />);

        act(() => {
            capturedProps.onEvents.click({ seriesIndex: 1, name: 'Code' });
        });
        expect(onProjectClick).not.toHaveBeenCalled();
    });

    it('expands the application Others block without changing top-level values', () => {
        const apps = [
            { name: 'Large App', value: 90 },
            { name: 'Small App A', value: 1 },
            { name: 'Small App B', value: 1 },
        ];
        render(<TimeTreemap {...props({ appData: apps })} />);

        expect(capturedProps.option.series[1].data).toEqual([
            { name: 'Large App', value: 90 },
            { name: APPLICATIONS_OTHER_NAME, value: 2 },
        ]);
        act(() => {
            capturedProps.onEvents.click({
                seriesIndex: 1,
                name: APPLICATIONS_OTHER_NAME,
            });
        });
        expect(capturedProps.option.series[1].data).toEqual([
            { name: 'Large App', value: 90 },
            {
                name: APPLICATIONS_OTHER_NAME,
                value: 2,
                children: [
                    { name: 'Small App A', value: 1 },
                    { name: 'Small App B', value: 1 },
                ],
            },
        ]);
    });

    it('collapses Others when another application block is clicked', () => {
        const apps = [
            { name: 'Large App', value: 90 },
            { name: 'Small App A', value: 1 },
            { name: 'Small App B', value: 1 },
        ];
        render(<TimeTreemap {...props({ appData: apps })} />);

        act(() => {
            capturedProps.onEvents.click({
                seriesIndex: 1,
                name: APPLICATIONS_OTHER_NAME,
            });
        });
        expect(capturedProps.option.series[1].data[1].children).toHaveLength(2);

        act(() => {
            capturedProps.onEvents.click({ seriesIndex: 1, name: 'Large App' });
        });
        expect(capturedProps.option.series[1].data).toEqual([
            { name: 'Large App', value: 90 },
            { name: APPLICATIONS_OTHER_NAME, value: 2 },
        ]);
    });

    it('renders without an onProjectClick handler', () => {
        render(<TimeTreemap {...props()} />);

        expect(() =>
            capturedProps.onEvents.click({ seriesIndex: 0, name: 'Board A' })
        ).not.toThrow();
    });
});
