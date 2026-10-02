import React, { FC, useEffect, useRef, useState } from 'react';
import { Table } from 'antd';
import { RootState } from '../../../reducers';
import { Dispatch } from 'redux';
import { KanbanBoardState } from './action';
import { connect } from 'react-redux';
import { CardsState } from '../Card/action';
import { IdTrend } from '../../Visualization/ProjectTrend';
import styled from 'styled-components';
import { formatTimeWithoutZero } from '../../../utils';
import { BoardBrief } from './BoardBrief';
import { actions, SortDirection, SortType } from '../action';
// @ts-ignore
import StackGrid from 'react-stack-grid';
import { Card, KanbanBoard, ListsState } from '../type';

const Container = styled.div``;

interface Props {
    boards: KanbanBoardState;
    lists: ListsState;
    cards: CardsState;
}

interface AggBoardInfo {
    _id: string;
    name: string;
    estimatedLeftTimeSum: number;
    actualTimeSum: number;
    pomodoroCount: number;
    meanPercentageError?: number;
}

const columns = [
    {
        title: 'Board Name',
        dataIndex: 'name',
        editable: true,
        key: 'name',
    },
    {
        title: 'Estimated Left Time',
        dataIndex: 'estimatedLeftTimeSum',
        key: 'estimatedLeftTimeSum',
        render: formatTimeWithoutZero,
        sorter: (a: AggBoardInfo, b: AggBoardInfo) =>
            a.estimatedLeftTimeSum - b.estimatedLeftTimeSum,
    },
    {
        title: 'Spent Time',
        dataIndex: 'actualTimeSum',
        key: 'actualTimeSum',
        render: formatTimeWithoutZero,
        sorter: (a: AggBoardInfo, b: AggBoardInfo) => a.actualTimeSum - b.actualTimeSum,
    },
    {
        title: 'Pomodoros',
        dataIndex: 'pomodoroCount',
        key: 'pomodoroCount',
        sorter: (a: AggBoardInfo, b: AggBoardInfo) => a.pomodoroCount - b.pomodoroCount,
    },
    {
        title: 'Mean Estimate Error',
        dataIndex: 'meanPercentageError',
        key: 'meanPercentageError',
        render: (text?: number) => {
            if (text === undefined) {
                return ``;
            }

            return `${text.toFixed(2)}%`;
        },
        sorter: (a: AggBoardInfo, b: AggBoardInfo) => {
            const va = a.meanPercentageError === undefined ? 1e8 : a.meanPercentageError;
            const vb = b.meanPercentageError === undefined ? 1e8 : b.meanPercentageError;
            return va - vb;
        },
    },
    {
        title: 'Trend',
        dataIndex: 'trend',
        key: 'trend',
        render: (text: any, record: AggBoardInfo) => {
            return <IdTrend boardId={record._id} />;
        },
    },
];

type NewCard = Card & { isDone?: boolean };
const _OverviewTable: FC<Props> = (props: Props) => {
    const { boards, lists: listsById, cards: cardsById } = props;
    const boardRows = Object.values(boards);

    const aggInfo: AggBoardInfo[] = boardRows.map((board) => {
        const { name, lists, relatedSessions, _id } = board;
        const cards: NewCard[] = lists.reduce((l: NewCard[], listId) => {
            for (const cardId of listsById[listId].cards) {
                const card: NewCard = cardsById[cardId];
                card.isDone = listId === board.doneList;
                l.push(card);
            }
            return l;
        }, []);
        const [estimatedLeftTimeSum, actualTimeSum, errorSum, n] = cards.reduce(
            (l: number[], r: NewCard) => {
                let err = 0;
                const { actual, estimated } = r.spentTimeInHour;
                if (r.isDone && actual !== 0 && estimated !== 0) {
                    err = (Math.abs(estimated - actual) / actual) * 100;
                }

                return [
                    l[0] + (r.isDone ? 0 : Math.max(0, estimated - actual)),
                    l[1] + actual,
                    l[2] + err,
                    l[3] + (r.isDone ? 1 : 0),
                ];
            },
            [0, 0, 0, 0]
        );
        return {
            _id,
            name,
            estimatedLeftTimeSum,
            actualTimeSum,
            meanPercentageError: n ? errorSum / n : undefined,
            pomodoroCount: relatedSessions.length,
        };
    });

    return (
        <Container>
            <Table rowKey={'name'} columns={columns} dataSource={aggInfo} />
        </Container>
    );
};

interface InputProps {
    showTable?: boolean;
    showConfigById?: (boardId: string) => void;
}

const OverviewTable = connect((state: RootState) => ({
    boards: state.kanban.boards,
    lists: state.kanban.lists,
    cards: state.kanban.cards,
}))(_OverviewTable);

const getPinScore = ({ pin: aPin }: KanbanBoard, { pin: bPin }: KanbanBoard) => {
    const a = aPin ? 1 : 0;
    const b = bPin ? 1 : 0;
    return -a + b;
};

const applyDirection = (value: number, desc?: boolean) => (desc ? -value : value);

// Sort board names so that (ascending) English names come first (a-z), then Chinese names
// by pinyin; descending reverses the whole order, like Windows Explorer.
const pinyinCollator = new Intl.Collator('zh-Hans-CN');
const isAscii = (s: string) => /^[\x00-\x7F]/.test(s); // first char ASCII => English group
const compareName = (a: string, b: string): number => {
    const aAscii = isAscii(a);
    const bAscii = isAscii(b);
    if (aAscii !== bAscii) return aAscii ? -1 : 1; // English group before Chinese group
    return pinyinCollator.compare(a, b); // English alphabetical / Chinese pinyin order
};
const nameCollator = { compare: compareName };

const sortFunc: Map<SortType, (a: KanbanBoard, b: KanbanBoard, desc?: boolean) => number> =
    new Map();
sortFunc.set('alpha', (a, b, desc) => {
    if (getPinScore(a, b)) return getPinScore(a, b);
    return applyDirection(nameCollator.compare(a.name, b.name), desc);
});
sortFunc.set('due', (a, b, desc) => {
    if (getPinScore(a, b)) return getPinScore(a, b);
    if (!a.dueTime) {
        return 1;
    }

    if (!b.dueTime) {
        return -1;
    }

    return applyDirection(a.dueTime - b.dueTime, desc);
});
sortFunc.set('spent', (a, b, desc) => {
    if (getPinScore(a, b)) return getPinScore(a, b);
    return applyDirection(-a.spentHours + b.spentHours, desc);
});
sortFunc.set('recent', (a, b, desc) => {
    if (getPinScore(a, b)) return getPinScore(a, b);
    if (!a.lastVisitTime) {
        return 1;
    }

    if (!b.lastVisitTime) {
        return -1;
    }

    return applyDirection(-a.lastVisitTime + b.lastVisitTime, desc);
});
sortFunc.set('created', (a, b, desc) => {
    if (getPinScore(a, b)) return getPinScore(a, b);
    if (!a.createdTime) {
        return 1;
    }

    if (!b.createdTime) {
        return -1;
    }

    return applyDirection(a.createdTime - b.createdTime, desc);
});

interface OverviewCardsProps {
    boards: KanbanBoard[];
    sortedBy: SortType;
    sortDirection: SortDirection;
    setId: (_id: string) => void;
    lists: ListsState;
    cards: CardsState;
    minimize: boolean;
    showConfigById?: (boardId: string) => void;
}

/**
 * Guard for `react-stack-grid@0.7.1`: when its measured container width shrinks to 0, its
 * `getColumnLengthAndWidth(0, 265, ...)` computes `maxColumn = 0`, leaving
 * `columnHeights = []`, so `Math.max(...[]) - gutterHeight` becomes
 * `-Infinity` and React warns `` `Infinity` is an invalid value for the
 * `height` css style property `` on the TransitionGroup div.
 *
 * `width < 1` (rather than `width <= 0`) also covers sub-pixel rounding:
 * anything below 1px still yields `maxColumn = 0` for a 265px column.
 */
const SafeStackGrid: FC<{ children: React.ReactNode; suspended?: boolean }> = ({
    children,
    suspended = false,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    // `null` = not measured yet: render the placeholder once so the first
    // measurement never feeds `undefined` into StackGrid's layout.
    const [width, setWidth] = useState<number | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const measure = () => {
            const nextWidth = el.clientWidth;
            setWidth((prev) => (prev === nextWidth ? prev : nextWidth));
        };
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(measure);
            observer.observe(el);
            return () => {
                observer.disconnect();
            };
        }
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
        };
    }, []);

    // The wrapper div (and its ref) stays mounted on both branches, so the
    // ResizeObserver keeps measuring and can bring the grid back on resize.
    // `suspended` unmounts the grid deterministically (e.g. mini mode hides
    // the pane *and* shrinks the window, and the inner SizeMe listener could
    // otherwise observe width 0 before our observer callback runs).
    const showGrid = !suspended && width !== null && width >= 1;
    return (
        <div ref={ref}>
            {showGrid ? (
                <StackGrid columnWidth={265} gutterHeight={0}>
                    {children}
                </StackGrid>
            ) : null}
        </div>
    );
};

const OverviewCards = connect(
    (state: RootState) => ({
        boards: Object.values(state.kanban.boards),
        sortedBy: state.kanban.kanban.sortedBy,
        sortDirection: state.kanban.kanban.sortDirection,
        lists: state.kanban.lists,
        cards: state.kanban.cards,
        minimize: state.timer.minimize,
    }),
    (dispatch: Dispatch) => ({
        setId: (_id: string) => actions.setChosenBoardId(_id)(dispatch),
    })
)(((props: OverviewCardsProps) => {
    const { boards, setId } = props;
    const [ids, setIds] = useState<string[]>([]);
    useEffect(() => {
        const desc = props.sortDirection === 'desc';
        if (
            props.sortedBy === 'due' ||
            props.sortedBy === 'alpha' ||
            props.sortedBy === 'spent' ||
            props.sortedBy === 'recent' ||
            props.sortedBy === 'created'
        ) {
            const sortFn = sortFunc.get(props.sortedBy);
            boards.sort((a, b) => (sortFn ? sortFn(a, b, desc) : 0));
        } else if (props.sortedBy === 'remaining') {
            const boardsMap: { [_id: string]: number } = {};
            for (let i = 0; i < boards.length; i += 1) {
                if (boardsMap[boards[i]._id] == null) {
                    boardsMap[boards[i]._id] = 0;
                }

                const board = boards[i];
                let leftSum = 0;
                for (const j of board.lists) {
                    if (j === board.doneList) {
                        continue;
                    }

                    for (const card of props.lists[j].cards) {
                        const h = props.cards[card].spentTimeInHour;
                        const left = h.estimated - h.actual;
                        leftSum += Math.max(0, left);
                    }
                }

                boardsMap[boards[i]._id] = leftSum;
            }

            boards.sort((a, b) => {
                if (getPinScore(a, b)) return getPinScore(a, b);
                return applyDirection(-boardsMap[a._id] + boardsMap[b._id], desc);
            });
        }
        setIds(boards.map((b) => b._id));
    }, [
        props.sortedBy,
        props.sortDirection,
        props.boards,
        props.sortedBy === 'remaining' && props.cards,
        boards.reduce((v, b) => (b.lastVisitTime ? b.lastVisitTime : 0) + v, 0),
    ]);

    return (
        <SafeStackGrid suspended={props.minimize}>
            {ids.map((_id) => {
                const onClick = () => setId(_id);
                const onSettingClick = props.showConfigById
                    ? () => {
                          props.showConfigById!(_id);
                      }
                    : undefined;
                return (
                    <BoardBrief
                        key={_id}
                        boardId={_id}
                        onClick={onClick}
                        onSettingClick={onSettingClick}
                    />
                );
            })}
        </SafeStackGrid>
    );
}) as FC<OverviewCardsProps>);

export const Overview: FC<InputProps> = ({ showTable = false, showConfigById }: InputProps) =>
    showTable ? <OverviewTable /> : <OverviewCards showConfigById={showConfigById} />;
