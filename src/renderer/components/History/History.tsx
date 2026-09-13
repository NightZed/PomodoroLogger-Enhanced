import React, { useEffect, useRef, useState } from 'react';
import { Card, Col, Row, Select, Statistic } from 'antd';
import { HistoryActionCreatorTypes, HistoryState } from './action';
import { GridCalendar } from '../../../components/Visualization/GridCalendar/GridCalendar';
import styled from 'styled-components';
import {
    AggPomodoroInfo,
    getAggPomodoroInfo,
    getTimeSpentDataFromRecords,
    TimeSpentData,
} from './op';
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
const ALL_TIME: 'all' = 'all';

const Container = styled.div`
    overflow-y: auto;
    margin: 0;
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
    const { expiringKey } = props;
    const [targetDate, setTargetDate] = useState<undefined | [number, number, number]>(undefined);
    const [shownPomodoros, setPomodoros] = useState<undefined | PomodoroRecord[]>(undefined);
    const [selectedDatePieChart, setSelectedDatePieChart] = useState<undefined | TimeSpentData>(
        undefined
    );
    const [selectedDateWordWeights, setSelectedDateWordWeights] = useState<
        undefined | [string, number][]
    >(undefined);
    const [chosenYear, setChosenYear] = useState<YearChoice>(new Date().getFullYear());
    const [aggInfo, setAggInfo] = useState<AggPomodoroInfo>({
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
    });
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
    useEffect(() => {
        let cancelled = false;
        const boardId = props.chosenId;
        const searchArg = props.chosenId === undefined ? {} : { boardId };
        // Avoid using outdated cache; And use worker to avoid db blocking the process
        // Load on demand to avoid pulling the whole session DB into the renderer:
        //  - records since the week/month boundary feed the Today/Week/Month stats;
        //  - records of the chosen year (or All time) feed the calendar/pie/word cloud
        //    and the total count/time badge, so the badge follows project + year;
        //  - with All time a single query covers both the recent stats and the full view.
        const db = workers.dbWorkers.sessionDB;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const weekStart = todayStart - new Date().getDay() * 86400 * 1000;
        const recentStart = Math.min(monthStart, weekStart);
        const recentArg = { ...searchArg, startTime: { $gte: recentStart } };
        let yearArg: any = searchArg;
        if (chosenYear !== ALL_TIME) {
            const yearStart = new Date(chosenYear, 0, 1).getTime();
            const nextYearStart = new Date(chosenYear + 1, 0, 1).getTime();
            yearArg = {
                ...searchArg,
                startTime: {
                    $gte: new Date(chosenYear, 0, 1).getTime(),
                    $lt: new Date(chosenYear + 1, 0, 1).getTime(),
                },
            };
        }

        Promise.all([
            chosenYear === ALL_TIME ? undefined : db.find(recentArg, {}),
            db.find(yearArg, {}),
        ])
            .then(([recentResult, yearDocs]) => {
                return getAggPomodoroInfo(recentResult ?? yearDocs, yearDocs);
            })
            .then((ans: AggPomodoroInfo) => {
                if (cancelled) {
                    return;
                }
                setAggInfo(ans);
                setTargetDate(undefined);
                setSelectedDatePieChart(undefined);
                setSelectedDateWordWeights(undefined);
                setPomodoros(undefined);
            })
            .catch((err) => {
                console.error('[History] failed to load aggregation', err);
            });
        return () => {
            cancelled = true;
        };
    }, [props.chosenId, expiringKey, chosenYear]);
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
    const calendarTill = new Date(
        chosenYear === ALL_TIME ? new Date().getFullYear() : chosenYear,
        11,
        31
    ).getTime();

    const shownPieChart = targetDate == null ? aggInfo.pieChart : selectedDatePieChart;
    const shownWordWeights = targetDate == null ? aggInfo.wordWeights : selectedDateWordWeights;

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
                        {Object.values(props.boards).map((v) => {
                            return (
                                <Option value={v._id} key={v._id}>
                                    {v.name}
                                </Option>
                            );
                        })}
                    </Select>
                    <Select
                        onChange={(v: any) => setChosenYear(v as YearChoice)}
                        value={chosenYear}
                        style={{ width: 120, marginLeft: 10 }}
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
                        <Card>
                            {aggInfo.agg.day != null ? (
                                <Statistic
                                    title="Pomodoros Today"
                                    value={aggInfo.agg.day.count}
                                    precision={0}
                                    valueStyle={{ color: '#3f8600' }}
                                />
                            ) : (
                                <Loading hideBackground={true} />
                            )}
                        </Card>
                    </Col>
                    <Col
                        span={8}
                        title={aggInfo.agg.week ? aggInfo.agg.week.hours.toFixed(1) + 'h' : ''}
                        style={{ cursor: 'default' }}
                    >
                        <Card>
                            {aggInfo.agg.week != null ? (
                                <Statistic
                                    title="Pomodoros This Week"
                                    value={aggInfo.agg.week.count}
                                    precision={0}
                                    valueStyle={{ color: '#3f8600' }}
                                />
                            ) : (
                                <Loading hideBackground={true} />
                            )}
                        </Card>
                    </Col>
                    <Col
                        span={8}
                        title={aggInfo.agg.month ? aggInfo.agg.month.hours.toFixed(1) + 'h' : ''}
                        style={{ cursor: 'default' }}
                    >
                        <Card>
                            {aggInfo.agg.month != null ? (
                                <Statistic
                                    title="Pomodoros This Month"
                                    value={aggInfo.agg.month.count}
                                    precision={0}
                                    valueStyle={{ color: '#cf1322' }}
                                />
                            ) : (
                                <Loading hideBackground={true} />
                            )}
                        </Card>
                    </Col>
                </Row>
                {aggInfo.pieChart != null && aggInfo.wordWeights != null ? (
                    calendarWidth > 670 ? (
                        <ChartContainer>
                            <GridCalendar
                                data={calendarData}
                                width={calendarWidth}
                                clickDate={clickDate}
                                till={calendarTill}
                                baseColor={props.calendarBaseColor}
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
                                        color: '#7f7f7f',
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
                                        color: '#7f7f7f',
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
