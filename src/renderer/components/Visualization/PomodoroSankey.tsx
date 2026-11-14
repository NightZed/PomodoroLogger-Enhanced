import * as React from 'react';
import ReactEcharts from 'echarts-for-react';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { actions } from '../Timer/action';
import type { DistractingRow } from '../Timer/action';
import { PomodoroRecord } from '../../monitor/type';
import { EfficiencyAnalyser } from '../../../shared/efficiency/efficiency';
import { ColorEncoder } from './ColorEncoder';
import { cloneDeep } from 'lodash';
import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import styled from 'styled-components';
import { t, useI18n } from '../../i18n';
import type { TranslateFn } from '../../../shared/i18n';
import { fatScrollBar } from '../../style/scrollbar';
import { formatTimeYmdHms } from './Timeline';
import { EChartsOption } from 'echarts';
import { ThemeTokens } from '../../theme/tokens';
import { useThemeTokens } from '../../theme/useThemeTokens';

const FullscreenStyled = styled.div`
    padding: 20px;
    position: fixed;
    /* Above every dialog (antd Modal wraps sit at 1000) and below the pickers
       (1100): the chart is opened from inside the History day editor and the
       board's unassigned panel, and those stay mounted underneath it. */
    z-index: 1050;
    left: 0;
    top: 0;
    overflow: auto;
    background-color: var(--pl-bg);
    width: 100%;
    height: 100vh;
    ${fatScrollBar}
`;

const InnerContainer = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
`;

/**
 * Clicks inside the chart stay in the chart: the tooltip is hover-only, and
 * node clicks drive the focus-highlight, so the background's click-to-close
 * must not see them. Catches the React synthetic clicks before they reach
 * `FullscreenStyled`; the canvas listeners ECharts attaches itself are
 * unaffected (they run on the way down, inside this container).
 */
const ChartArea = styled.div`
    width: 100%;
`;

const Header = styled.div`
    margin-top: 20px;
    h1,
    h2,
    h3,
    h4,
    h5 {
        margin: 0;
        text-align: center;
    }

    h4 {
        color: var(--pl-text-secondary);
    }

    h5 {
        color: var(--pl-text-secondary);
        font-size: 10px;
    }
`;

interface Props {
    record?: PomodoroRecord;
    boardName?: string;
    efficiencyAnalyser: EfficiencyAnalyser;
    showSwitch: boolean;
    width?: number;
    cancel?: () => void;
}

const breakWord = (key: string, breaker: string = '\n', maxLength: number = 40): string => {
    if (key.length > maxLength) {
        return (
            key.slice(0, maxLength) + breaker + breakWord(key.slice(maxLength), breaker, maxLength)
        );
    }

    return key;
};

const getLinkAndNode = (
    record: PomodoroRecord,
    efficiencyAnalyser: EfficiencyAnalyser,
    showSwitch: boolean = false,
    translate: TranslateFn = t
) => {
    // tslint:disable-next-line:no-parameter-reassignment
    record = cloneDeep(record);
    const getStayTimeSum = (index: number) => {
        let ans = 0;
        for (let i = 0; i < record.stayTimeInSecond!.length; i += 1) {
            if (record.switchActivities![i] === index) {
                ans += record.stayTimeInSecond![i];
            }
        }

        return ans;
    };

    const indexToTitleApp: [string, string, string][] = [];
    const nodes = [];
    const links = [];

    nodes.push({
        name: translate('chart.sankey.focused'),
        itemStyle: {
            color: '#34cb23',
            borderColor: '#34cb23',
        },
        label: {
            fontWeight: 700,
        },
    });
    nodes.push({
        name: translate('chart.sankey.distracted'),
        itemStyle: {
            color: '#55409c',
            borderColor: '#55409c',
        },
        label: {
            fontWeight: 700,
        },
    });
    const colorEncoder = new ColorEncoder();
    for (const app in record.apps) {
        const _app = record.apps[app];
        const color = colorEncoder.getAColor();
        let appKey = app[0].toUpperCase() + app.slice(1);
        while (nodes.find((v) => v.name === appKey)) {
            appKey += '[App]';
        }
        nodes.push({
            name: appKey,
            label: {
                fontWeight: 700,
            },
            itemStyle: {
                color,
                borderColor: color,
            },
        });
        for (const title in _app.titleSpentTime) {
            const new_title = title.replace(/-,-/g, '.');
            // `get-windows` reports an empty title for some windows (hidden
            // browser surfaces, games), and `titleSpentTime` keeps that key
            // verbatim. Left alone it becomes a nameless node, and an empty
            // name is also what the tooltip formatter below would read as
            // "this is a link". Name it the way the kanban names an untitled
            // card instead.
            const titleLabel = new_title === '' ? translate('chart.sankey.untitled') : new_title;
            let key = breakWord(titleLabel, '\n', 24);
            if (key.length > 48) {
                key = key.slice(0, 45) + '...';
            }
            if (!Object.prototype.hasOwnProperty.call(_app.titleSpentTime, title)) {
                continue;
            }

            const _title = _app.titleSpentTime[title];
            while (nodes.find((v) => v.name === key)) {
                key += '.';
            }
            const value = getStayTimeSum(_title.index);
            indexToTitleApp[_title.index] = [title, app, key];
            nodes.push({
                name: key,
                label: {
                    show: value > 30,
                    fontSize: 12,
                },
                tooltip: {
                    /**
                     * A hovered node carries only its name, while a link
                     * carries `source` / `target` plus a numeric `value`. Pick
                     * the branch by shape, not by whether `name` is truthy:
                     * this formatter runs inside ECharts' mousemove handler,
                     * where a throw never reaches the error page -- it only
                     * kills the tooltip and lands in `crash.log`.
                     */
                    formatter: (params: any) => {
                        const item: { source?: string; target?: string; value?: number } =
                            (params && params.data) || {};
                        if (typeof item.value === 'number') {
                            const source = item.source === key ? titleLabel : item.source;
                            const target = item.target === key ? titleLabel : item.target;
                            return breakWord(
                                `${source} --- ${target}: ${item.value.toFixed(1)}`,
                                '<br/>'
                            );
                        }

                        return `${breakWord(titleLabel, '<br/>')}: ${value}`;
                    },
                },
            });
            links.push({
                value,
                source: appKey,
                target: key,
            });

            if (!showSwitch) {
                if (efficiencyAnalyser.getIsDistracting(app, title)) {
                    links.push({
                        target: translate('chart.sankey.distracted'),
                        source: key,
                        value: getStayTimeSum(_title.index),
                    });
                } else {
                    links.push({
                        target: translate('chart.sankey.focused'),
                        source: key,
                        value: getStayTimeSum(_title.index),
                    });
                }
            }
        }
    }

    if (showSwitch) {
        for (let i = 0; i < record.switchActivities!.length; i += 1) {
            const index = record.switchActivities![i];
            const [title, app, titleKey] = indexToTitleApp[index];
            const name = `[Activity]${i}`;
            nodes.push({
                name,
                label: {
                    show: false,
                },
            });
            links.push({
                source: titleKey,
                target: name,
                value: record.stayTimeInSecond![i],
            });
            if (efficiencyAnalyser.getIsDistracting(app, title)) {
                links.push({
                    target: translate('chart.sankey.distracted'),
                    source: name,
                    value: record.stayTimeInSecond![i],
                });
            } else {
                links.push({
                    target: translate('chart.sankey.focused'),
                    source: name,
                    value: record.stayTimeInSecond![i],
                });
            }
        }
    }

    return {
        nodes,
        links,
    };
};

const getOption = (
    record: PomodoroRecord,
    efficiencyAnalyser: EfficiencyAnalyser,
    showSwitch: boolean,
    tokens: ThemeTokens,
    translate: TranslateFn = t
): EChartsOption => {
    const data = getLinkAndNode(record, efficiencyAnalyser, showSwitch, translate);
    return {
        title: {
            text: '',
        },
        tooltip: {
            trigger: 'item',
            triggerOn: 'mousemove',
            backgroundColor: 'var(--pl-bg-elevated)',
            borderColor: 'var(--pl-border)',
            textStyle: {
                color: 'var(--pl-text)',
            },
            extraCssText: 'box-shadow: 0 2px 8px var(--pl-shadow);',
        },
        series: [
            {
                type: 'sankey',
                // ECharts' default entry animation is 1000ms, which reads as
                // "the chart takes a second to appear". Keep the entrance
                // short so the finished diagram shows within ~0.2s.
                animationDuration: 200,
                animationDurationUpdate: 150,
                animationDelay: 0,
                animationDelayUpdate: 0,
                // ECharts defaults to left 5% / right 20% (the extra right
                // room is reserved for right-hand labels). With nodeAlign
                // 'justify' the graph then fills 5%..80% of the canvas, so
                // the drawing sits left of center even though the container
                // div itself is centered. Equal left/right padding centers
                // the diagram horizontally; percentages keep it proportional
                // at any window size. 15% still leaves ~90px on a ~600px
                // canvas, enough for the rightmost "Focused" / "Distracted"
                // labels (~86px: 20px node + 5px gap + 14px bold text) so
                // they are not clipped by the canvas edge.
                left: '10%',
                right: '10%',
                data: data.nodes,
                links: data.links,
                focusNodeAdjacency: true,
                levels: [
                    {
                        depth: 0,
                        lineStyle: {
                            color: 'source',
                            opacity: 0.6,
                        },
                    },
                    {
                        depth: 1,
                        itemStyle: {
                            color: '#b48ee3',
                            borderColor: '#b48ee3',
                        },
                        lineStyle: {
                            color: 'target',
                            opacity: 0.6,
                        },
                    },
                    {
                        depth: 2,
                        itemStyle: {
                            color: '#abe38f',
                            borderColor: '#abe38f',
                        },
                        lineStyle: {
                            color: 'target',
                            opacity: 0.6,
                        },
                    },
                    {
                        depth: 3,
                        lineStyle: {
                            color: 'target',
                            opacity: 0.6,
                        },
                    },
                ],
                label: {
                    color: tokens.text,
                    fontFamily: 'Arial',
                    fontSize: 14,
                },
                lineStyle: {
                    color: 'target',
                    curveness: 0.5,
                },
                itemStyle: {
                    color: '#1f77b4',
                    borderColor: '#1f77b4',
                },
            },
        ],
    };
};

export const PomodoroSankey = (props: Props) => {
    const { boardName, cancel, efficiencyAnalyser, record, showSwitch, width = '100%' } = props;
    const { tokens } = useThemeTokens();
    const { t: translate } = useI18n();
    // Every hook must run unconditionally: this component stays mounted even
    // before a record is chosen, and the early returns below used to change
    // the hook count between renders, which crashed with "Rendered more hooks
    // than during the previous render".
    const option = React.useMemo(
        () =>
            record == null
                ? undefined
                : getOption(record, efficiencyAnalyser, showSwitch, tokens, translate),
        [efficiencyAnalyser, record, showSwitch, tokens, translate]
    );
    /**
     * Esc closes the overlay.
     *
     * Not `Hotkeys`: that component stands down whenever an antd dialog is
     * open, and this overlay can be opened from two dialogs (the History day
     * editor and the board's unassigned panel). Listening in the capture phase
     * also keeps rc-dialog from treating the same press as "close the dialog
     * underneath", which would ask the user to discard unsaved edits on their
     * way out of the chart.
     *
     * There is deliberately no Enter binding: Enter is not a dismissal key,
     * and a global one would close the overlay from behind any confirmation
     * the user answers with the keyboard. (Click-to-close lives on the
     * background, see the render below.)
     */
    React.useEffect(() => {
        if (record == null || cancel === undefined) {
            return undefined;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }
            event.stopPropagation();
            cancel();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [record, cancel]);
    if (record == null) {
        return <></>;
    }
    const isOutdated =
        record.switchActivities == null ||
        record.stayTimeInSecond == null ||
        record.switchActivities.length !== record.stayTimeInSecond.length;
    if (isOutdated) {
        // A fixed key keeps re-renders from stacking identical toasts.
        feedback.toast({
            kind: 'info',
            key: 'sankey-outdated',
            content: FEEDBACK_MESSAGES.statistics.sankeyOutdated,
        });
        return <></>;
    }
    if (option == null) {
        // Unreachable in practice: the memo above computes the option as soon
        // as a record is present; it just keeps the type narrow for ReactEcharts.
        return <></>;
    }
    // The background (and the header above the chart) closes the overlay; the
    // chart itself keeps its clicks, see `ChartArea`.
    return (
        <FullscreenStyled onClick={cancel}>
            <InnerContainer>
                <Header>
                    <h1>{t('chart.sankey.title')}</h1>
                    <h2>{boardName}</h2>
                    <h4>{formatTimeYmdHms(record.startTime)}</h4>
                    <h5>{t('chart.sankey.exitHint')}</h5>
                </Header>
                <ChartArea onClick={(event) => event.stopPropagation()}>
                    <ReactEcharts
                        option={option}
                        style={{
                            width,
                            height: 'calc(100vh - 140px)',
                            minHeight: '640px',
                        }}
                    />
                </ChartArea>
            </InnerContainer>
        </FullscreenStyled>
    );
};

/**
 * `mapStateToProps` runs on every store update, while the overlay can stay
 * open during a running session (one update per second). Keeping one analyser
 * until the distracting rules actually change keeps the option memo below
 * stable; `isSame` compares the rules by value.
 */
let cachedEfficiencyAnalyser: EfficiencyAnalyser | undefined;

function getCachedEfficiencyAnalyser(distractingList: DistractingRow[]): EfficiencyAnalyser {
    if (cachedEfficiencyAnalyser?.isSame(distractingList)) {
        return cachedEfficiencyAnalyser;
    }

    cachedEfficiencyAnalyser = new EfficiencyAnalyser(distractingList);
    return cachedEfficiencyAnalyser;
}

export const ConnectedPomodoroSankey = connect(
    (state: RootState): Props => {
        const record = state.timer.chosenRecord;
        const board = record && record.boardId ? state.kanban.boards[record.boardId] : undefined;
        const boardDistractingList = board ? board.distractionList || [] : [];
        return {
            showSwitch: false,
            efficiencyAnalyser: getCachedEfficiencyAnalyser(
                state.timer.distractingList.concat(boardDistractingList)
            ),
            record: state.timer.chosenRecord,
            boardName: board ? board.name : undefined,
        };
    },
    (dispatch) => ({
        cancel: () => dispatch(actions.setChosenRecord(undefined)),
    })
)(PomodoroSankey);
