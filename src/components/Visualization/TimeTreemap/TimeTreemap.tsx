import { EChartsOption, SeriesOption } from 'echarts';
import ReactEcharts from 'echarts-for-react';
import * as React from 'react';
import {
    DAY_TREEMAP_COLORS,
    NIGHT_TREEMAP_COLORS,
    ThemeTokens,
} from '../../../renderer/theme/tokens';
import { useThemeTokens } from '../../../renderer/theme/useThemeTokens';

export interface Props {
    width?: number;
    height?: number;
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
    onProjectClick?: (project: string) => void;
    showAllApplications?: boolean;
}

interface TreemapItem {
    name: string;
    value: number;
    children?: TreemapItem[];
}

export const PROJECT_SERIES_NAME = 'Project Hours';
export const APP_SERIES_NAME = 'Application Hours';
export const APPLICATIONS_OTHER_NAME = 'Others';
/** The two panels meet here: each one spans 49% with a 2% gutter between. */
const PANEL_DIVIDE = '51%';
/** Below the two title/subtitle blocks. */
const PANEL_TOP = 44;
const MIN_READABLE_AREA = 2200;
const MIN_SQUARE_RATIO = 1.15;
const MAX_SQUARE_RATIO = 2.25;
const sumHours = (data: { value: number }[]): number =>
    data.reduce((sum, item) => sum + item.value, 0);

const percentOf = (value: number, total: number): number => (total > 0 ? (value / total) * 100 : 0);

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

function getApplicationDisplayData(
    data: { name: string; value: number }[],
    width: number,
    height: number,
    showAll: boolean
): TreemapItem[] {
    if (data.length < 2 || width <= 0 || height <= 0) {
        return data;
    }

    const total = sumHours(data);
    const minimumShare = total > 0 ? MIN_READABLE_AREA / (width * height) : 0;
    const visible: TreemapItem[] = [];
    let otherValue = 0;

    for (const item of data) {
        if (item.value / total < minimumShare) {
            otherValue += item.value;
        } else {
            visible.push(item);
        }
    }

    if (otherValue === 0) {
        return data;
    }

    return [
        ...visible,
        {
            name: APPLICATIONS_OTHER_NAME,
            value: otherValue,
            ...(showAll
                ? {
                      children: data.filter((item) => item.value / total < minimumShare),
                  }
                : {}),
        },
    ];
}

export function getSquareRatio(
    data: { name: string; value: number }[],
    width: number,
    height: number
): number {
    const total = sumHours(data);
    const largestShare = total > 0 ? Math.max(...data.map((item) => item.value)) / total : 0;
    const panelAspect = height > 0 ? width / height : 1;
    const aspectBias = clamp(panelAspect, 0.75, 2.5) * 0.3;
    const dominantBlockPenalty = largestShare * 0.8;

    return clamp(1.25 + aspectBias - dominantBlockPenalty, MIN_SQUARE_RATIO, MAX_SQUARE_RATIO);
}

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
    tokens: ThemeTokens,
    width: number,
    height: number,
    showAllApplications = false
): SeriesOption {
    const displayData =
        name === APP_SERIES_NAME
            ? getApplicationDisplayData(data, width, height, showAllApplications)
            : data;
    const colors =
        tokens.treemapColors ??
        (tokens.base === 'dark' ? NIGHT_TREEMAP_COLORS : DAY_TREEMAP_COLORS);

    return {
        name,
        type: 'treemap',
        ...position,
        animation: true,
        animationDuration: 100,
        animationDurationUpdate: 500,
        animationEasing: 'cubicOut',
        // A statistics panel, not an explorable tree: no pan, no zoom-to-node,
        // no breadcrumb. The History view already offers its own filtering.
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        squareRatio: getSquareRatio(displayData, width, height),
        levels: [
            {
                color: colors,
            },
            {
                color: colors,
            },
        ],
        label: {
            show: true,
            formatter: labelFormatter(sumHours(displayData)),
            color: tokens.text,
            fontSize: 12,
            lineHeight: 16,
            // textShadowColor: 'rgba(0, 0, 0, 0.45)',
            // textShadowBlur: 2,
        },
        itemStyle: {
            // Page-colored seams between the blocks read as gaps in both themes.
            borderColor: tokens.bg,
            borderWidth: 1,
        },
        data: displayData,
    };
}

/**
 * Exported for tests; the component itself only wires it to echarts-for-react.
 */
export function getOption(props: Props, tokens: ThemeTokens): EChartsOption {
    const width = props.width ?? 800;
    const height = props.height ?? 400;
    const panelWidth = width * 0.49;
    const panelHeight = Math.max(0, height - PANEL_TOP);
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
            // custom properties directly because the tooltip is rendered as HTML.
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
                tokens,
                panelWidth,
                panelHeight
            ),
            treemapSeries(
                APP_SERIES_NAME,
                props.appData,
                { left: PANEL_DIVIDE, top: PANEL_TOP, right: 0, bottom: 0 },
                tokens,
                panelWidth,
                panelHeight,
                props.showAllApplications
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
    const [showAllApplications, setShowAllApplications] = React.useState(false);
    const option = React.useMemo(
        () => getOption({ projectData, appData, width, height, showAllApplications }, tokens),
        [projectData, appData, width, height, showAllApplications, tokens]
    );

    // Only the project panel filters the view; app blocks are informational.
    const onEvents = React.useMemo(
        () => ({
            click: (params: any) => {
                if (params.seriesIndex === 0 && onProjectClick) {
                    onProjectClick(String(params.name));
                }
                if (params.seriesIndex === 1) {
                    setShowAllApplications(params.name === APPLICATIONS_OTHER_NAME);
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
