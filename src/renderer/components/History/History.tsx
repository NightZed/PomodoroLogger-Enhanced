import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Row, Select, Statistic } from 'antd';
import { HistoryActionCreatorTypes, HistoryState } from './action';
import {
    GridCalendar,
    monthList,
} from '../../../components/Visualization/GridCalendar/GridCalendar';
import styled from 'styled-components';
import { AggPomodoroInfo, getTimeSpentDataFromRecords, TimeSpentData } from './op';
import { WordCloud } from '../Visualization/WordCloud';
import { KanbanBoardState } from '../Kanban/Board/action';
import { Loading } from '../utils/Loading';
import { debounce } from 'lodash';
import { fatScrollBar } from '../../style/scrollbar';
import { PomodoroNumView } from '../Timer/PomodoroNumView';
import { PomodoroRecord } from '../../monitor/type';
import { formatTimeYMD } from '../Visualization/Timeline';
import { BadgeHolder } from '../Kanban/style/Badge';
import { PomodoroDot } from '../Visualization/PomodoroDot';
import { TimeBadge } from '../../../components/Visualization/Badge/Badge';
import { workers } from '../../workers';
import { Card as CardState } from '../Kanban/type';
import { DualPieChart } from '../../../components/Visualization/DualPieChart';

const { Option } = Select;

type YearChoice = number | 'all';
/** For the month picker: every month of the chosen year. */
type MonthChoice = number | 'all';
const ALL_TIME = 'all' as const;
const ALL_MONTHS = 'all' as const;
/** One entry per (project, year, month); 4 was too few once months came along. */
const MAX_AGG_CACHE_ENTRIES = 16;
/**
 * `loading` is the only state that shows spinners. A failed aggregation has to
 * end in `error`: the request can fail or time out (the db worker only has so
 * much budget for a 15MB session file), and a swallowed rejection used to leave
 * the page spinning forever, because the effect blanks `aggInfo` before it asks.
 */
type LoadStatus = 'loading' | 'ready' | 'error';

const EMPTY_AGG_INFO: AggPomodoroInfo = {
    agg: {
        day: undefined,
        month: undefined,
        week: undefined,
    },
    total: {
        count: undefined,
        usedTime: undefined,
    },
    calendarCount: undefined,
    pieChart: undefined,
    wordWeights: undefined,
};

const Container = styled.div`
    overflow-y: auto;
    margin: 0;
    color: var(--pl-text);
    padding: 20px;
    height: calc(100vh - 45px);
    ${fatScrollBar}

    & .visible-pomodoros-view {
        transform-origin: 0 0;
        transition: transform 150ms;
        margin: 6px;
        height: 28px;
    }

    & .invisible-pomodoros-view {
        transform: scale(1, 0);
        margin: 6px;
        height: 28px;
    }
`;

const SubContainer = styled.div`
    max-width: 1200px;
    min-width: 736px;
    margin: 0 auto;
`;

const ChartContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
`;

interface Props extends HistoryActionCreatorTypes, HistoryState {
    chosenId?: string;
    boards: KanbanBoardState;
    chooseRecord: (r: PomodoroRecord) => void;
    getCardsByBoardId: (boardId: string | undefined) => CardState[];
    calendarBaseColor: string;
}

export const History: React.FunctionComponent<Props> = React.memo((props: Props) => {
    const [targetDate, setTargetDate] = useState<undefined | [number, number, number]>(undefined);
    const [shownPomodoros, setPomodoros] = useState<undefined | PomodoroRecord[]>(undefined);
    const [selectedDatePieChart, setSelectedDatePieChart] = useState<undefined | TimeSpentData>(
        undefined
    );
    const [selectedDateWordWeights, setSelectedDateWordWeights] = useState<
        undefined | [string, number][]
    >(undefined);
    const [chosenYear, setChosenYear] = useState<YearChoice>(new Date().getFullYear());
    // Opens on the whole chosen year, matching what the view showed before the
    // month picker existed; picking a month narrows it. Every month is always
    // selectable, one without records simply aggregates to nothing.
    const [chosenMonth, setChosenMonth] = useState<MonthChoice>(ALL_MONTHS);
    const [aggInfo, setAggInfo] = useState<AggPomodoroInfo>(EMPTY_AGG_INFO);
    const [status, setStatus] = useState<LoadStatus>('loading');
    const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
    // Bumped by the retry button to re-run the aggregation effect as is.
    const [reloadToken, setReloadToken] = useState(0);
    const container = useRef<HTMLDivElement>();
    const [calendarWidth, setCalendarWidth] = useState(document.body.clientWidth - 40);

    const resizeEffect = () => {
        const setWidth = debounce(() => {
            const w = !container.current
                ? 800
                : container.current.clientWidth > 1060
                ? 1000
                : container.current.clientWidth - 60;
            setCalendarWidth(w);
        }, 200);
        setWidth();
        window.addEventListener('resize', setWidth);
        return () => {
            setWidth.cancel();
            window.removeEventListener('resize', setWidth);
        };
    };

    useEffect(resizeEffect, []);
    // Cache aggregated results per (project, year, month) so switching back and
    // forth is instant. Cleared whenever expiringKey changes (a new pomodoro record
    // landed, so cached aggregates may be stale).
    const aggCache = useRef(new Map<string, AggPomodoroInfo>());
    const lastExpiringKey = useRef(props.expiringKey);
    useEffect(() => {
        const cache = aggCache.current;
        return () => {
            cache.clear();
        };
    }, []);

    const cacheAggregation = (key: string, value: AggPomodoroInfo) => {
        const cache = aggCache.current;
        cache.delete(key);
        cache.set(key, value);
        while (cache.size > MAX_AGG_CACHE_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            cache.delete(oldestKey);
        }
    };

    useEffect(() => {
        let cancelled = false;
        if (lastExpiringKey.current !== props.expiringKey) {
            lastExpiringKey.current = props.expiringKey;
            aggCache.current.clear();
        }

        const cacheKey = `${props.chosenId ?? 'all'}|${chosenYear}|${chosenMonth}`;
        const cached = aggCache.current.get(cacheKey);
        if (cached) {
            aggCache.current.delete(cacheKey);
            aggCache.current.set(cacheKey, cached);
            setAggInfo(cached);
            setStatus('ready');
            setErrorMsg(undefined);
            setTargetDate(undefined);
            setSelectedDatePieChart(undefined);
            setSelectedDateWordWeights(undefined);
            setPomodoros(undefined);
            return () => {
                cancelled = true;
            };
        }

        // Reset the stale aggregation immediately so the UI shows the same
        // Loading state as on first open, and the previous year's/project's
        // charts (and their memory) are released right away. `status` is what
        // the UI keys off, so a rejected request lands in `error` below instead
        // of leaving these empty values spinning forever.
        setAggInfo(EMPTY_AGG_INFO);
        setStatus('loading');
        setErrorMsg(undefined);
        // Avoid using outdated cache; And use worker to avoid db blocking the process
        // Load on demand to avoid pulling the whole session DB into the renderer:
        //  - records since the week/month boundary feed the Today/Week/Month stats;
        //  - records of the chosen year (or All time) feed the calendar, which keeps
        //    its full-year window whatever month is picked;
        //  - `periodRange` narrows the same year records down to the chosen month for
        //    the badge / pie chart / word cloud, so the badge follows project + month
        //    without the calendar losing the rest of the year; picking `All` months drops
        //    the range so those views cover the whole year again;
        //  - with All time no range is sent and a single query covers both the recent
        //    stats and the full view.
        // The whole aggregation runs inside the db worker (aggHistory op), so raw
        // records never cross to the main thread and only the small aggregated
        // result is transferred back. The worker also resolves the project names
        // from the kanban DB itself, which is why `props.boards` is not part of
        // the dependency list below: loading/renaming a board must not re-run
        // the aggregation and throw the page back into its Loading state.
        const db = workers.dbWorkers.sessionDB;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const weekStart = todayStart - new Date().getDay() * 86400 * 1000;
        const recentStart = Math.min(monthStart, weekStart);
        const searchArg = props.chosenId === undefined ? {} : { boardId: props.chosenId };
        const recentArg = { ...searchArg, startTime: { $gte: recentStart } };
        let yearArg: any = searchArg;
        let periodRange: { from: number; to: number } | undefined = undefined;
        if (chosenYear !== ALL_TIME) {
            yearArg = {
                ...searchArg,
                startTime: {
                    $gte: new Date(chosenYear, 0, 1).getTime(),
                    $lt: new Date(chosenYear + 1, 0, 1).getTime(),
                },
            };
            // `All` months means "no narrowing": the worker then falls back to the
            // year records, which restores the previous whole-year badge/charts.
            // `new Date(year, 12, 1)` rolls over to January on its own, so December
            // needs no special case.
            if (chosenMonth !== ALL_MONTHS) {
                periodRange = {
                    from: new Date(chosenYear, chosenMonth - 1, 1).getTime(),
                    to: new Date(chosenYear, chosenMonth, 1).getTime(),
                };
            }
        }

        db.aggHistory({
            recentQuery: chosenYear === ALL_TIME ? undefined : recentArg,
            yearQuery: yearArg,
            periodRange,
        })
            .then((ans: AggPomodoroInfo) => {
                if (cancelled) {
                    return;
                }

                cacheAggregation(cacheKey, ans);
                setAggInfo(ans);
                setStatus('ready');
                setErrorMsg(undefined);
                setTargetDate(undefined);
                setSelectedDatePieChart(undefined);
                setSelectedDateWordWeights(undefined);
                setPomodoros(undefined);
            })
            .catch((err) => {
                console.error('[History] failed to load aggregation', err);
                if (cancelled) {
                    return;
                }

                setStatus('error');
                setErrorMsg(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, [props.chosenId, props.expiringKey, chosenYear, chosenMonth, reloadToken]);

    const retry = () => {
        setReloadToken((token) => token + 1);
    };
    useEffect(() => {
        if (targetDate == null) {
            return;
        }

        let cancelled = false;
        const db = workers.dbWorkers.sessionDB;
        const dateStart = new Date(targetDate[0], targetDate[1] - 1, targetDate[2]);
        const nextDay = new Date(targetDate[0], targetDate[1] - 1, targetDate[2] + 1);
        const boardId = props.chosenId;
        const searchArg =
            boardId === undefined
                ? { startTime: { $lt: nextDay.getTime(), $gte: dateStart.getTime() } }
                : {
                      boardId,
                      startTime: { $lt: nextDay.getTime(), $gte: dateStart.getTime() },
                  };
        setPomodoros(undefined);
        setSelectedDatePieChart(undefined);
        setSelectedDateWordWeights(undefined);
        db.find(searchArg, {}).then(async (docs) => {
            if (cancelled) {
                return;
            }
            setPomodoros(
                docs.length ? [...docs].sort((a, b) => a.startTime - b.startTime) : undefined
            );
            const [pieChart, wordWeights] = await Promise.all([
                getTimeSpentDataFromRecords(docs),
                workers.tokenizer.tokenize(docs, []),
            ]);
            if (!cancelled) {
                setSelectedDatePieChart(pieChart);
                setSelectedDateWordWeights(wordWeights);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [targetDate, props.chosenId]);

    const onChange = (v: string) => {
        props.setChosenProjectId(v || undefined);
    };

    const onProjectClick = (name: string) => {
        const v = Object.values(props.boards).find((v) => v.name === name);
        if (v) {
            props.setChosenProjectId(v._id);
        }
    };

    const clickDate = React.useCallback((year: number, month: number, day: number) => {
        setTargetDate([year, month, day]);
    }, []);

    // Sort boards by creation time in descending order so the newest project
    // is rendered first in the dropdown, i.e. closest to the select box —
    // the same order the timer's FocusSelector uses. Legacy boards without
    // createdTime are treated as the oldest.
    const sortedBoards = React.useMemo(
        () =>
            Object.values(props.boards).sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0)),
        [props.boards]
    );

    // Feed the calendar only with data of the currently selected year, so a stale
    // aggregation from the previous selection never meets the new calendar window
    // while the new query is still in flight.
    const calendarData = React.useMemo(() => {
        if (chosenYear === ALL_TIME || !aggInfo.calendarCount) {
            return aggInfo.calendarCount;
        }

        const yearStart = new Date(chosenYear, 0, 1).getTime();
        const nextYearStart = new Date(chosenYear + 1, 0, 1).getTime();
        const ans: typeof aggInfo.calendarCount = {};
        for (const key in aggInfo.calendarCount) {
            const t = parseInt(key, 10);
            if (t >= yearStart && t < nextYearStart) {
                ans[key] = aggInfo.calendarCount[key];
            }
        }
        return ans;
    }, [aggInfo.calendarCount, chosenYear]);

    // All time shows the full current-year calendar, so anchor the window to the year end.
    // Picking a month never moves this window: the heat map stays on the whole year,
    // the charts below it just describe the selected month.
    const calendarTill = new Date(
        chosenYear === ALL_TIME ? new Date().getFullYear() : chosenYear,
        11,
        31
    ).getTime();

    const shownPieChart = targetDate == null ? aggInfo.pieChart : selectedDatePieChart;
    const shownWordWeights = targetDate == null ? aggInfo.wordWeights : selectedDateWordWeights;

    // The three stat cards show a spinner only while a load is actually running.
    // After a failure they would spin forever next to the error card, so they
    // fall back to a dash instead.
    const statSlot = (
        loaded: { count: number; hours: number } | undefined,
        title: string,
        color: string
    ) => {
        if (loaded != null) {
            return (
                <Statistic
                    title={title}
                    value={loaded.count}
                    precision={0}
                    valueStyle={{ color }}
                />
            );
        }

        return status === 'error' ? (
            <Statistic title={title} value={'-'} valueStyle={{ color }} />
        ) : (
            <Loading hideBackground={true} />
        );
    };

    return (
        <Container>
            <SubContainer ref={container as any}>
                <Row style={{ marginBottom: 20, display: 'flex', alignItems: 'center' }}>
                    <Select
                        onChange={onChange}
                        value={props.chosenId}
                        style={{ width: 200 }}
                        placeholder={'Set Project Filter'}
                    >
                        <Option value="" key="all-projects">
                            All Projects
                        </Option>
                        {sortedBoards.map((v) => {
                            return (
                                <Option value={v._id} key={v._id}>
                                    {v.name}
                                </Option>
                            );
                        })}
                    </Select>
                    {/* Short enough that the month picker fits beside it without
                        pushing the badges around. */}
                    <Select
                        onChange={(v: any) => setChosenYear(v as YearChoice)}
                        value={chosenYear}
                        style={{ width: 90, marginLeft: 10 }}
                    >
                        <Option value={ALL_TIME} key="all-time">
                            All time
                        </Option>
                        {Array.from(
                            { length: new Date().getFullYear() - 2018 + 1 },
                            (_, i) => 2018 + i
                        )
                            .reverse()
                            .map((y) => (
                                <Option value={y} key={y}>
                                    {y}
                                </Option>
                            ))}
                    </Select>
                    {/* All time has no month dimension to narrow, so the picker
                        greys out instead of pretending to filter something. */}
                    <Select
                        onChange={(v: any) =>
                            setChosenMonth(v === ALL_MONTHS ? ALL_MONTHS : Number(v))
                        }
                        value={chosenMonth}
                        disabled={chosenYear === ALL_TIME}
                        style={{ width: 70, marginLeft: 10 }}
                    >
                        <Option value={ALL_MONTHS} key="all-months">
                            All
                        </Option>
                        {monthList.map((label, i) => (
                            <Option value={i + 1} key={label}>
                                {label}
                            </Option>
                        ))}
                    </Select>
                    <BadgeHolder style={{ marginLeft: 10 }}>
                        {aggInfo.total.count != null ? (
                            <PomodoroDot num={aggInfo.total.count} />
                        ) : undefined}
                        {aggInfo.total.usedTime != null ? (
                            <TimeBadge spentTime={aggInfo.total.usedTime} leftTime={0} />
                        ) : undefined}
                    </BadgeHolder>
                </Row>
                <Row gutter={16}>
                    <Col
                        span={8}
                        title={aggInfo.agg.day ? aggInfo.agg.day.hours.toFixed(1) + 'h' : ''}
                        style={{ cursor: 'default' }}
                    >
                        <Card>{statSlot(aggInfo.agg.day, 'Pomodoros Today', '#3f8600')}</Card>
                    </Col>
                    <Col
                        span={8}
                        title={aggInfo.agg.week ? aggInfo.agg.week.hours.toFixed(1) + 'h' : ''}
                        style={{ cursor: 'default' }}
                    >
                        <Card>{statSlot(aggInfo.agg.week, 'Pomodoros This Week', '#3f8600')}</Card>
                    </Col>
                    <Col
                        span={8}
                        title={aggInfo.agg.month ? aggInfo.agg.month.hours.toFixed(1) + 'h' : ''}
                        style={{ cursor: 'default' }}
                    >
                        <Card>
                            {statSlot(aggInfo.agg.month, 'Pomodoros This Month', '#cf1322')}
                        </Card>
                    </Col>
                </Row>
                {status === 'error' ? (
                    <Card style={{ textAlign: 'center' }}>
                        <div
                            style={{
                                fontSize: 14,
                                color: 'var(--pl-text-secondary)',
                                marginBottom: 12,
                            }}
                        >
                            Failed to load history data
                            {errorMsg ? `: ${errorMsg}` : ''}
                        </div>
                        <Button type="primary" onClick={retry}>
                            Retry
                        </Button>
                    </Card>
                ) : aggInfo.pieChart != null && aggInfo.wordWeights != null ? (
                    calendarWidth > 670 ? (
                        <ChartContainer>
                            <GridCalendar
                                data={calendarData}
                                width={calendarWidth}
                                clickDate={clickDate}
                                till={calendarTill}
                                baseColor={props.calendarBaseColor}
                                // With `All` months nothing is singled out, so no label is bolded.
                                highlightMonth={
                                    chosenYear === ALL_TIME || chosenMonth === ALL_MONTHS
                                        ? undefined
                                        : chosenMonth
                                }
                            />
                            <div
                                className={
                                    shownPomodoros
                                        ? 'visible-pomodoros-view'
                                        : 'invisible-pomodoros-view'
                                }
                            >
                                <span
                                    style={{
                                        fontSize: 14,
                                        color: 'var(--pl-text-secondary)',
                                        margin: '0 5px',
                                        display: 'inline-block',
                                    }}
                                >
                                    {shownPomodoros
                                        ? formatTimeYMD(shownPomodoros[0].startTime)
                                        : 'No Data'}
                                </span>
                                <PomodoroNumView
                                    inline={true}
                                    pomodoros={shownPomodoros || []}
                                    showNum={false}
                                    chooseRecord={props.chooseRecord}
                                />
                            </div>
                            {aggInfo.total.count === 0 ? (
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: 'var(--pl-text-secondary)',
                                        margin: '20px 0',
                                        textAlign: 'center',
                                    }}
                                >
                                    No pomodoro records in this period
                                </div>
                            ) : (
                                <>
                                    <DualPieChart
                                        {...(shownPieChart || { projectData: [], appData: [] })}
                                        width={calendarWidth}
                                        onProjectClick={onProjectClick}
                                    />
                                    <WordCloud
                                        weights={shownWordWeights || []}
                                        width={calendarWidth}
                                        height={calendarWidth * 0.6}
                                    />
                                </>
                            )}
                        </ChartContainer>
                    ) : undefined
                ) : (
                    <Loading size={'large'} />
                )}
            </SubContainer>
        </Container>
    );
});
