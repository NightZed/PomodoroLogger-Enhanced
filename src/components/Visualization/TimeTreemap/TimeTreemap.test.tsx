import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

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

import { getOption, Props, PROJECT_SERIES_NAME, APP_SERIES_NAME, TimeTreemap } from './TimeTreemap';
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
        expect(apps.type).toBe('treemap');
        expect(apps.name).toBe(APP_SERIES_NAME);
        // Both panels span the full height; the right one starts where the
        // left one ends (PANEL_DIVIDE), so no space is wasted.
        expect(projects.left).toBe(0);
        expect(projects.right).toBe('51%');
        expect(apps.left).toBe('51%');
        expect(apps.right).toBe(0);
        for (const series of option.series) {
            expect(series.bottom).toBe(0);
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
});

describe('TimeTreemap click wiring', () => {
    beforeEach(() => {
        capturedProps = null;
    });

    it('forwards project block clicks to onProjectClick', async () => {
        const onProjectClick = jest.fn();
        await act(async () => {
            TestRenderer.create(<TimeTreemap {...props({ onProjectClick })} />);
        });

        capturedProps.onEvents.click({ seriesIndex: 0, name: 'Board A' });
        expect(onProjectClick).toHaveBeenCalledWith('Board A');
    });

    it('ignores app block clicks: only projects filter the view', async () => {
        const onProjectClick = jest.fn();
        await act(async () => {
            TestRenderer.create(<TimeTreemap {...props({ onProjectClick })} />);
        });

        capturedProps.onEvents.click({ seriesIndex: 1, name: 'Code' });
        expect(onProjectClick).not.toHaveBeenCalled();
    });

    it('renders without an onProjectClick handler', async () => {
        await act(async () => {
            TestRenderer.create(<TimeTreemap {...props()} />);
        });

        expect(() =>
            capturedProps.onEvents.click({ seriesIndex: 0, name: 'Board A' })
        ).not.toThrow();
    });
});
