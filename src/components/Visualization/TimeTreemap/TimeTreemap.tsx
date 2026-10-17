import { EChartsOption, SeriesOption } from 'echarts';
import ReactEcharts from 'echarts-for-react';
import * as React from 'react';
import { ThemeTokens } from '../../../renderer/theme/tokens';
import { useThemeTokens } from '../../../renderer/theme/useThemeTokens';

export interface Props {
    width?: number;
    height?: number;
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
    onProjectClick?: (project: string) => void;
}

export const PROJECT_SERIES_NAME = 'Project Hours';
export const APP_SERIES_NAME = 'Application Hours';
/** The two panels meet here: each one spans 49% with a 2% gutter between. */
const PANEL_DIVIDE = '51%';
/** Below the two title/subtitle blocks. */
const PANEL_TOP = 44;

const sumHours = (data: { value: number }[]): number =>
    data.reduce((sum, item) => sum + item.value, 0);

const percentOf = (value: number, total: number): number => (total > 0 ? (value / total) * 100 : 0);

/**
 * `params.value` is the raw data value, which a treemap node may carry as a
 * plain number or as a dimension array depending on how the tree was built.
 */
const nodeValue = (params: any): number =>
    Array.isArray(params.value) ? params.value[0] : Number(params.value);

/**
 * The pie's `{d}` percent placeholder is pie-series specific and stays empty
 * for treemaps, so each panel formats percentages against its own total.
 * The hours sit next to the share so a block reads the spend without needing
 * a hover, and they use one decimal to match the panel totals above.
 * Blocks too small for two lines get ellipsized by the treemap's built-in
 * label truncation, which is what keeps a crowded period readable.
 */
function labelFormatter(total: number) {
    return (params: any) => {
        const value = nodeValue(params);
        return `${params.name}\n${value.toFixed(1)} h (${percentOf(value, total).toFixed(1)}%)`;
    };
}

function tooltipFormatter(projectTotal: number, appTotal: number) {
    return (params: any) => {
        const value = nodeValue(params);
        const total = params.seriesIndex === 0 ? projectTotal : appTotal;
        const percent = percentOf(value, total).toFixed(1);
        return `${params.marker}${params.name}: ${value} h (${percent}%)`;
    };
}

/**
 * One rectangle per project/app, area proportional to hours spent — the pie
 * rings "unrolled" into panels that scale to any number of entries without
 * the labels colliding.
 */
function treemapSeries(
    name: string,
    data: { name: string; value: number }[],
    position: { left: number | string; top: number; right: number | string; bottom: number },
    tokens: ThemeTokens
): SeriesOption {
    return {
        name,
        type: 'treemap',
        ...position,
        // A statistics panel, not an explorable tree: no pan, no zoom-to-node,
        // no breadcrumb. The History view already offers its own filtering.
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
            show: true,
            formatter: labelFormatter(sumHours(data)),
            color: '#fff',
            fontSize: 12,
            // Palette blocks range from light green to dark red; a shadow keeps
            // the white label readable on the lighter ones. Canvas text cannot
            // resolve var(), so these are literal colors in both themes.
            textShadowColor: 'rgba(0, 0, 0, 0.45)',
            textShadowBlur: 2,
        },
        itemStyle: {
            // Page-colored seams between the blocks read as gaps in both themes.
            borderColor: tokens.bg,
            borderWidth: 1,
        },
        data,
    };
}

/**
 * Exported for tests; the component itself only wires it to echarts-for-react.
 */
export function getOption(props: Props, tokens: ThemeTokens): EChartsOption {
    const projectTotal = sumHours(props.projectData);
    const appTotal = sumHours(props.appData);
    const panelTitle = {
        textStyle: { color: tokens.text, fontSize: 14 },
        subtextStyle: { color: tokens.textSecondary, fontSize: 12 },
    };

    return {
        title: [
            {
                text: 'Projects',
                subtext: `${projectTotal.toFixed(1)} h`,
                left: 0,
                top: 0,
                ...panelTitle,
            },
            {
                text: 'Applications',
                subtext: `${appTotal.toFixed(1)} h`,
                left: PANEL_DIVIDE,
                top: 0,
                ...panelTitle,
            },
        ],
        tooltip: {
            trigger: 'item',
            // The tooltip is rendered as HTML, so it can use the `--pl-*` CSS
            // custom properties directly (same approach as DualPieChart).
            formatter: tooltipFormatter(projectTotal, appTotal),
            backgroundColor: 'var(--pl-bg-elevated)',
            borderColor: 'var(--pl-border)',
            textStyle: {
                color: 'var(--pl-text)',
            },
            extraCssText: 'box-shadow: 0 2px 8px var(--pl-shadow);',
        },
        series: [
            treemapSeries(
                PROJECT_SERIES_NAME,
                props.projectData,
                { left: 0, top: PANEL_TOP, right: PANEL_DIVIDE, bottom: 0 },
                tokens
            ),
            treemapSeries(
                APP_SERIES_NAME,
                props.appData,
                { left: PANEL_DIVIDE, top: PANEL_TOP, right: 0, bottom: 0 },
                tokens
            ),
        ],
    };
}

/**
 * Two side-by-side treemaps replacing the dual pie chart on the History page:
 * projects on the left, applications on the right, each block's area showing
 * its share of the time. Clicking a project block filters the view to it.
 */
export const TimeTreemap: React.FC<Props> = (props: Props) => {
    const { tokens } = useThemeTokens();
    const { projectData, appData, onProjectClick } = props;
    const { width = 800, height = 400 } = props;
    const option = React.useMemo(
        () => getOption({ projectData, appData }, tokens),
        [projectData, appData, tokens]
    );

    // Only the project panel filters the view; app blocks are informational.
    const onEvents = React.useMemo(
        () => ({
            click: (params: any) => {
                if (params.seriesIndex === 0 && onProjectClick) {
                    onProjectClick(String(params.name));
                }
            },
        }),
        [onProjectClick]
    );

    return (
        <ReactEcharts
            option={option}
            lazyUpdate={true}
            onEvents={onEvents}
            style={{ width, height }}
        />
    );
};
