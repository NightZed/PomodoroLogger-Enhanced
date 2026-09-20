import { EChartOption } from 'echarts';
import ReactEcharts from 'echarts-for-react';
import * as React from 'react';
import { ThemeTokens } from '../../../renderer/theme/tokens';
import { useThemeTokens } from '../../../renderer/theme/useThemeTokens';

export interface Props {
    width?: number;
    projectData: { name: string; value: number }[];
    appData: { name: string; value: number }[];
    onProjectClick?: (project: string) => void;
}

/**
 * The tooltip is rendered as HTML, so it can use the `--pl-*` CSS custom
 * properties directly; everything painted on the canvas (labels, legend) is
 * given explicit theme colors because canvas text cannot resolve var().
 */
function getOption(props: Props, tokens: ThemeTokens): EChartOption {
    const option: EChartOption = {
        tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)',
            backgroundColor: 'var(--pl-bg-elevated)',
            borderColor: 'var(--pl-border)',
            textStyle: {
                color: 'var(--pl-text)',
            },
            extraCssText: 'box-shadow: 0 2px 8px var(--pl-shadow);',
        },
        legend: {
            orient: 'vertical',
            // @ts-ignore
            x: 'left',
            data: props.appData.map((v) => v.name).concat(props.projectData.map((v) => v.name)),
            textStyle: {
                color: tokens.text,
            },
        },
        series: [
            {
                name: 'Project Hours',
                type: 'pie',
                selectedMode: 'single',
                radius: [0, '30%'],

                label: {
                    normal: {
                        position: 'inner',
                    },
                },
                labelLine: {
                    normal: {
                        show: false,
                    },
                },
                data: props.projectData,
            },
            {
                name: 'Application Hours',
                type: 'pie',
                radius: ['40%', '55%'],
                label: {
                    normal: {
                        formatter: '{a|{a}}{abg|}\n{hr|}\n  {b|{b}：}{c}  {per|{d}%}  ',
                        color: tokens.text,
                        backgroundColor: tokens.bgElevated,
                        borderColor: tokens.border,
                        borderWidth: 1,
                        borderRadius: 4,
                        rich: {
                            a: {
                                color: tokens.textSecondary,
                                lineHeight: 22,
                                align: 'center',
                            },
                            hr: {
                                borderColor: tokens.border,
                                width: '100%',
                                borderWidth: 0.5,
                                height: 0,
                            },
                            b: {
                                color: tokens.text,
                                fontSize: 16,
                                lineHeight: 33,
                            },
                            per: {
                                color: '#eee',
                                backgroundColor: '#334455',
                                padding: [2, 4],
                                borderRadius: 2,
                            },
                        },
                    },
                },
                data: props.appData,
            },
        ],
    };

    return option;
}

export const DualPieChart: React.FC<Props> = (props: Props) => {
    const { tokens } = useThemeTokens();
    const [option, setOption] = React.useState(() => getOption(props, tokens));
    const { width = 800 } = props;
    React.useEffect(() => {
        setOption(getOption(props, tokens));
    }, [props.appData, props.projectData, tokens]);
    return <ReactEcharts option={option} lazyUpdate={true} style={{ width, height: 400 }} />;
};
