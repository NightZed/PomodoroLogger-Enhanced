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
    const [chosenYear, setChosenYear] = useState<number>(new Date().getFullYear());
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
        // 按需加载，避免将整个 session 数据库全量拉入渲染进程：
        //  - 近一周/一月内的记录用于“今日/本周/本月”聚合；
        //  - 选定年份的记录用于日历/饼图/词云；
        //  - 全量计数使用轻量的 count 查询。
        const db = workers.dbWorkers.sessionDB;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const weekStart = todayStart - new Date().getDay() * 86400 * 1000;
        const recentStart = Math.min(monthStart, weekStart);
        const yearStart = new Date(chosenYear, 0, 1).getTime();
        const nextYearStart = new Date(chosenYear + 1, 0, 1).getTime();
        const recentArg = { ...searchArg, startTime: { $gte: recentStart } };
        const yearArg = { ...searchArg, startTime: { $gte: yearStart, $lt: nextYearStart } };

        Promise.all([db.find(recentArg, {}), db.find(yearArg, {}), db.count(searchArg)])
            .then(([recentDocs, yearDocs, totalCount]) => {
                return getAggPomodoroInfo(
                    recentDocs,
                    props.getCardsByBoardId(boardId),
                    yearDocs,
                    totalCount
                );
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

    const filteredCalendarCount = React.useMemo(() => {
        if (!aggInfo.calendarCount) return aggInfo.calendarCount;
        const yearStart = new Date(chosenYear, 0, 1).getTime();
        const yearEnd = new Date(chosenYear + 1, 0, 1).getTime();
        const ans: typeof aggInfo.calendarCount = {};
        for (const key in aggInfo.calendarCount) {
            const t = parseInt(key, 10);
            if (t >= yearStart && t < yearEnd) {
                ans[key] = aggInfo.calendarCount[key];
            }
        }
        return ans;
    }, [aggInfo.calendarCount, chosenYear]);

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
                        onChange={(v: number) => setChosenYear(v)}
                        value={chosenYear}
                        style={{ width: 120, marginLeft: 10 }}
                    >
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
                                data={filteredCalendarCount}
                                width={calendarWidth}
                                clickDate={clickDate}
                                till={new Date(chosenYear, 11, 31).getTime()}
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
                            <DualPieChart
                                {...(targetDate == null
                                    ? aggInfo.pieChart
                                    : selectedDatePieChart || { projectData: [], appData: [] })}
                                width={calendarWidth}
                                onProjectClick={onProjectClick}
                            />
                            <WordCloud
                                weights={
                                    targetDate == null
                                        ? aggInfo.wordWeights
                                        : selectedDateWordWeights || []
                                }
                                width={calendarWidth}
                                height={calendarWidth * 0.6}
                            />
                        </ChartContainer>
                    ) : undefined
                ) : (
                    <Loading size={'large'} />
                )}
            </SubContainer>
        </Container>
    );
});
