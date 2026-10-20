import React, { FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Table } from 'antd';
import { RootState } from '../../../reducers';
import { Dispatch } from 'redux';
import { KanbanBoardState } from './action';
import { connect } from 'react-redux';
import { CardsState } from '../Card/action';
import { IdTrend } from '../../Visualization/ProjectTrend';
import styled, { keyframes } from 'styled-components';
import { formatTimeWithoutZero } from '../../../utils';
import { BoardBrief } from './BoardBrief';
import { actions, SortDirection, SortType } from '../action';
import { Card, KanbanBoard, ListsState } from '../type';

const Container = styled.div``;

// Waterfall geometry, matching what react-stack-grid used before the React 19
// migration removed it: fixed-width columns, a 5px gutter, and cards placed in
// the currently shortest column (left to right on equal heights).
const BOARD_COLUMN_WIDTH = 265;
const BOARD_GUTTER = 5;
const BOARD_APPEAR_DURATION = 320;
const BOARD_APPEAR_DELAY = 20;
const BOARD_APPEAR_MAX_STAGGER = 12;
const BOARD_EASING = 'cubic-bezier(0.165, 0.84, 0.44, 1)';

const boardAppear = keyframes`
    0% {
        opacity: 0;
        transform: translateY(10px);
    }
    100% {
        opacity: 1;
        transform: translateY(0);
    }
`;

const BoardGrid = styled.div`
    position: relative;
`;

// Positions are applied instantly. Transitioning every card's transform made
// a sort/resize slide cards across each other while the columns were being
// recomputed (which read as uneven gaps), and it kept dozens of composited
// layers animating at once. Only the one-shot appear animation below remains.
const BoardGridItem = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    width: ${BOARD_COLUMN_WIDTH}px;
`;

const BoardGridItemInner = styled.div<{ $delay: number }>`
    display: flow-root;
    animation: ${boardAppear} ${BOARD_APPEAR_DURATION}ms ${BOARD_EASING}
        ${({ $delay }) => `${$delay}ms`} both;
`;

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

interface BoardRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface BoardLayout {
    rects: { [key: string]: BoardRect };
    height: number;
    measured: boolean;
}

const getChildKey = (child: React.ReactNode, index: number): string =>
    React.isValidElement(child) && child.key != null ? String(child.key) : `board-${index}`;

/**
 * Height occupied by a card in a column: its border box plus the margins it
 * renders with. Measuring the card itself (instead of the absolutely
 * positioned wrapper) keeps animated/overflowing descendants and inline-block
 * line boxes out of the result -- those could otherwise add a few pixels to
 * `scrollHeight` and leave uneven gaps after a reorder.
 */
const measureItemHeight = (item: HTMLElement): number => {
    const card = item.querySelector<HTMLElement>('.kanban-brief-card');
    if (!card) {
        return Math.round(Math.max(item.scrollHeight, item.clientHeight, item.offsetHeight, 0));
    }
    const style = window.getComputedStyle(card);
    const margin = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    return Math.round(card.offsetHeight + margin);
};

const sameRects = (a: { [key: string]: BoardRect }, b: { [key: string]: BoardRect }): boolean => {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) {
        return false;
    }
    return aKeys.every((key) => {
        const ra = a[key];
        const rb = b[key];
        return (
            rb !== undefined &&
            ra.top === rb.top &&
            ra.left === rb.left &&
            ra.width === rb.width &&
            ra.height === rb.height
        );
    });
};

/**
 * Pinterest-like waterfall grid with the ordering of the removed
 * `react-stack-grid` dependency: items fill the leftmost shortest column, so
 * equal-height cards run left-to-right and then top-to-bottom. Positions use
 * transforms (animated on reorder) and new items fade up with the old stagger.
 *
 * The elements stay in the DOM while their heights are measured, which keeps
 * later content growth (the nested list-count chart) from being laid out
 * against stale card heights -- the reason the old grid needed an explicit
 * `updateLayout()` on every frame.
 */
export const ResponsiveBoardGrid: FC<{ children: React.ReactNode; suspended?: boolean }> = ({
    children,
    suspended = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const measuredHeights = useRef<Map<string, number>>(new Map());
    const [width, setWidth] = useState<number | null>(null);
    const [layout, setLayout] = useState<BoardLayout>({
        rects: {},
        height: 0,
        measured: false,
    });
    const [measureVersion, setMeasureVersion] = useState(0);
    const measureRaf = useRef<number | null>(null);

    const scheduleMeasure = useCallback(() => {
        if (measureRaf.current !== null) {
            cancelAnimationFrame(measureRaf.current);
        }
        measureRaf.current = requestAnimationFrame(() => {
            measureRaf.current = null;
            setMeasureVersion((v) => v + 1);
        });
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        let widthRaf: number | null = null;
        const measureWidth = () => {
            if (widthRaf !== null) {
                cancelAnimationFrame(widthRaf);
            }
            widthRaf = requestAnimationFrame(() => {
                widthRaf = null;
                if (!el.isConnected) {
                    return;
                }
                const nextWidth = el.clientWidth;
                setWidth((prev) => (prev === nextWidth ? prev : nextWidth));
            });
        };

        measureWidth();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(measureWidth);
            observer.observe(el);
            return () => {
                observer.disconnect();
                if (widthRaf !== null) {
                    cancelAnimationFrame(widthRaf);
                }
            };
        }
        window.addEventListener('resize', measureWidth);
        return () => {
            window.removeEventListener('resize', measureWidth);
            if (widthRaf !== null) {
                cancelAnimationFrame(widthRaf);
            }
        };
    }, []);

    // Observe every card so a change in its rendered height (chart data
    // arriving after mount, images/fonts) reflows the columns beneath it.
    // Below one column the pane is hidden (inactive tab, mini mode) or too
    // narrow; not rendering the cards mirrors the old StackGrid guard, and
    // remounts them -- replaying the appear animation -- when it is shown again.
    const canRenderItems = !suspended && width !== null && width >= BOARD_COLUMN_WIDTH;
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(scheduleMeasure);
        itemRefs.current.forEach((el) => observer.observe(el));
        // Re-measure once after the commit as well: a reorder never changes a
        // card's own height, but nested content (the list-count chart) can
        // settle one frame later and would otherwise leave stale gaps.
        scheduleMeasure();
        return () => observer.disconnect();
    }, [children, canRenderItems, scheduleMeasure]);

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        const availableWidth = width ?? el.clientWidth;
        if (width === null && availableWidth > 0) {
            setWidth(availableWidth);
        }

        if (suspended || availableWidth < BOARD_COLUMN_WIDTH) {
            setLayout((prev) => (prev.measured ? { rects: {}, height: 0, measured: false } : prev));
            return;
        }

        const maxColumn = Math.max(
            1,
            Math.floor(
                (availableWidth - (availableWidth / BOARD_COLUMN_WIDTH - 1) * BOARD_GUTTER) /
                    BOARD_COLUMN_WIDTH
            )
        );
        const actualWidth = maxColumn * BOARD_COLUMN_WIDTH + (maxColumn - 1) * BOARD_GUTTER;
        const offset = Math.max(0, (availableWidth - actualWidth) / 2);
        const columnHeights = new Array<number>(maxColumn).fill(0);
        const rects: { [key: string]: BoardRect } = {};

        React.Children.toArray(children).forEach((child, index) => {
            const key = getChildKey(child, index);
            const item = itemRefs.current.get(key);
            const measuredHeight = item ? measureItemHeight(item) : undefined;
            if (measuredHeight !== undefined) {
                measuredHeights.current.set(key, measuredHeight);
            }
            // Fall back to the last known height while a card is remounting;
            // measuring 0 there would stack the whole column on top of itself.
            const height = measuredHeight ?? measuredHeights.current.get(key) ?? 0;

            let column = 0;
            for (let i = 1; i < columnHeights.length; i += 1) {
                if (columnHeights[i] < columnHeights[column]) {
                    column = i;
                }
            }

            const top = columnHeights[column];
            const left = offset + column * (BOARD_COLUMN_WIDTH + BOARD_GUTTER);
            // `gutterHeight` was 0 in the old grid: the card itself carries its
            // vertical margins, so only the measured height is accumulated.
            columnHeights[column] += height;

            rects[key] = { top, left, width: BOARD_COLUMN_WIDTH, height };
        });

        const height = Math.max(...columnHeights);
        setLayout((prev) => {
            if (prev.measured && prev.height === height && sameRects(prev.rects, rects)) {
                return prev;
            }
            return { rects, height, measured: true };
        });
    }, [children, width, measureVersion, suspended]);

    useEffect(
        () => () => {
            if (measureRaf.current !== null) {
                cancelAnimationFrame(measureRaf.current);
            }
        },
        []
    );

    const visible = canRenderItems && layout.measured;
    const items = React.Children.toArray(children);

    return (
        <BoardGrid
            ref={containerRef}
            style={{
                height: layout.height,
                visibility: visible ? 'visible' : 'hidden',
            }}
        >
            {canRenderItems
                ? items.map((child, index) => {
                      const key = getChildKey(child, index);
                      const rect = layout.rects[key];
                      return (
                          <BoardGridItem
                              key={key}
                              ref={(el) => {
                                  if (el) {
                                      itemRefs.current.set(key, el);
                                  } else {
                                      itemRefs.current.delete(key);
                                  }
                              }}
                              style={
                                  rect
                                      ? {
                                            transform: `translate3d(${Math.round(
                                                rect.left
                                            )}px, ${Math.round(rect.top)}px, 0)`,
                                        }
                                      : undefined
                              }
                          >
                              <BoardGridItemInner
                                  $delay={
                                      Math.min(index, BOARD_APPEAR_MAX_STAGGER) * BOARD_APPEAR_DELAY
                                  }
                              >
                                  {child}
                              </BoardGridItemInner>
                          </BoardGridItem>
                      );
                  })
                : null}
        </BoardGrid>
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
        <ResponsiveBoardGrid suspended={props.minimize}>
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
        </ResponsiveBoardGrid>
    );
}) as FC<OverviewCardsProps>);

export const Overview: FC<InputProps> = ({ showTable = false, showConfigById }: InputProps) =>
    showTable ? <OverviewTable /> : <OverviewCards showConfigById={showConfigById} />;
