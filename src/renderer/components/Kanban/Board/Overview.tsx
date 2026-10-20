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
    boardsById: KanbanBoardState;
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
    const itemRefCallbacks = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
    const measuredHeights = useRef<Map<string, number>>(new Map());
    const pendingMeasure = useRef<Set<string>>(new Set());
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const [width, setWidth] = useState<number | null>(null);
    const [layout, setLayout] = useState<BoardLayout>({
        rects: {},
        height: 0,
        measured: false,
    });
    const [measureVersion, setMeasureVersion] = useState(0);
    const measureRaf = useRef<number | null>(null);

    // Coalesce every measurement request (newly mounted or resized cards) into
    // one render. The old implementation scheduled a new frame from an effect
    // that depended on `children`, i.e. on every parent render, and then
    // measured *all* cards synchronously -- the source of the forced-reflow
    // violations while clicking around the overview.
    const scheduleMeasure = useCallback((key?: string) => {
        if (key !== undefined) {
            pendingMeasure.current.add(key);
        }
        if (measureRaf.current !== null) {
            return;
        }
        measureRaf.current = requestAnimationFrame(() => {
            measureRaf.current = null;
            setMeasureVersion((v) => v + 1);
        });
    }, []);

    // Keep one ref callback per key: an inline callback gets detached and
    // re-attached on every render, which looks like a remount to the observer.
    const attachItem = useCallback(
        (key: string, el: HTMLDivElement | null) => {
            const previous = itemRefs.current.get(key);
            if (el === null) {
                if (previous !== undefined) {
                    resizeObserverRef.current?.unobserve(previous);
                    itemRefs.current.delete(key);
                }
                return;
            }

            el.dataset.gridKey = key;
            itemRefs.current.set(key, el);
            if (previous === el) {
                return;
            }
            resizeObserverRef.current?.observe(el);
            scheduleMeasure(key);
        },
        [scheduleMeasure]
    );

    const getItemRefCallback = useCallback(
        (key: string) => {
            let callback = itemRefCallbacks.current.get(key);
            if (callback === undefined) {
                callback = (el: HTMLDivElement | null) => attachItem(key, el);
                itemRefCallbacks.current.set(key, callback);
            }
            return callback;
        },
        [attachItem]
    );

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
                setWidth((prev) => {
                    // An inactive tab pane is `display: none`, so its width
                    // reads 0. Keeping the last real width lets the cards stay
                    // mounted across a tab switch instead of tearing the whole
                    // overview down and rebuilding (and re-animating) it when
                    // the page comes back.
                    if (nextWidth === 0 && prev !== null) {
                        return prev;
                    }
                    return prev === nextWidth ? prev : nextWidth;
                });
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

    // One observer for the grid's lifetime; ref callbacks add/remove cards as
    // they mount. A card only needs a new measurement when its own box size
    // changed (chart data arriving, images/fonts, a resize), not when the
    // parent happens to render again.
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            // Inactive tab panes are `display: none`: every observed card
            // reports a 0x0 box. Measuring there would replace the cached
            // heights with zero and squash the grid while it is hidden, so
            // ignore those entries; the real size is reported when the pane is
            // shown again.
            if (containerRef.current?.clientWidth === 0) {
                return;
            }

            for (const entry of entries) {
                const target = entry.target as HTMLElement;
                if (target.dataset.gridKey !== undefined) {
                    pendingMeasure.current.add(target.dataset.gridKey);
                }
            }
            scheduleMeasure();
        });
        resizeObserverRef.current = observer;
        itemRefs.current.forEach((el, key) => {
            el.dataset.gridKey = key;
            observer.observe(el);
        });
        return () => {
            observer.disconnect();
            resizeObserverRef.current = null;
        };
    }, [scheduleMeasure]);

    // Mini mode and windows narrower than one column skip the cards entirely.
    // Inactive tabs keep their last width (see the width observer above), so a
    // page switch does not unmount and remount the whole overview.
    const canRenderItems = !suspended && width !== null && width >= BOARD_COLUMN_WIDTH;

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        // Hidden tab pane: keep the last measured layout untouched.
        if (el.clientWidth === 0) {
            pendingMeasure.current.clear();
            return;
        }

        const availableWidth = width ?? el.clientWidth;
        if (width === null && availableWidth > 0) {
            setWidth(availableWidth);
        }

        if (suspended || availableWidth < BOARD_COLUMN_WIDTH) {
            pendingMeasure.current.clear();
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

            // Measure only cards that are new or were reported as resized;
            // everything else reuses the cached height. This is what keeps a
            // reorder (or any unrelated overview render) from reading layout
            // for every card on the page.
            if (
                item !== undefined &&
                (pendingMeasure.current.has(key) || !measuredHeights.current.has(key))
            ) {
                pendingMeasure.current.delete(key);
                measuredHeights.current.set(key, measureItemHeight(item));
            }

            // Fall back to the last known height while a card is remounting;
            // measuring 0 there would stack the whole column on top of itself.
            const height = measuredHeights.current.get(key) ?? 0;

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
            itemRefCallbacks.current.clear();
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
                              ref={getItemRefCallback(key)}
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

/**
 * Order the board ids for the overview. This runs in a `useMemo` instead of an
 * effect that wrote the ids back into state: the old version re-sorted and
 * committed a second render on every parent render (the `boards` array was
 * recreated by `mapStateToProps`), which in turn remeasured the whole grid.
 */
const getSortedBoardIds = (
    boards: KanbanBoard[],
    sortedBy: SortType,
    sortDirection: SortDirection,
    lists: ListsState,
    cards: CardsState
): string[] => {
    const sorted = boards.concat();
    const desc = sortDirection === 'desc';

    if (sortedBy === 'remaining') {
        const leftByBoardId: { [_id: string]: number } = {};
        for (const board of sorted) {
            let leftSum = 0;
            for (const listId of board.lists) {
                if (listId === board.doneList) {
                    continue;
                }

                const list = lists[listId];
                if (list === undefined) {
                    continue;
                }

                for (const cardId of list.cards) {
                    const card = cards[cardId];
                    if (card === undefined) {
                        continue;
                    }

                    const h = card.spentTimeInHour;
                    leftSum += Math.max(0, h.estimated - h.actual);
                }
            }

            leftByBoardId[board._id] = leftSum;
        }

        sorted.sort((a, b) => {
            if (getPinScore(a, b)) return getPinScore(a, b);
            return applyDirection(-leftByBoardId[a._id] + leftByBoardId[b._id], desc);
        });
    } else {
        const sortFn = sortFunc.get(sortedBy);
        if (sortFn) {
            sorted.sort((a, b) => sortFn(a, b, desc));
        }
    }

    return sorted.map((board) => board._id);
};

const OverviewCards = connect(
    (state: RootState) => ({
        // Keep the stable map: `Object.values` here returned a fresh array on
        // every store notification, so an unrelated dispatch (a timer tick, a
        // tab switch, ...) re-rendered and re-sorted the whole overview.
        boardsById: state.kanban.boards,
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
    const { boardsById, setId } = props;
    const boards = React.useMemo(() => Object.values(boardsById), [boardsById]);
    const ids = React.useMemo(
        () =>
            getSortedBoardIds(
                boards,
                props.sortedBy,
                props.sortDirection,
                props.lists,
                props.cards
            ),
        [boards, props.sortedBy, props.sortDirection, props.lists, props.cards]
    );

    return (
        <ResponsiveBoardGrid suspended={props.minimize}>
            {ids.map((_id) => (
                <BoardBrief
                    key={_id}
                    boardId={_id}
                    onClick={setId}
                    onSettingClick={props.showConfigById}
                />
            ))}
        </ResponsiveBoardGrid>
    );
}) as FC<OverviewCardsProps>);

// Memoized so a local state change of the page (opening the board editor,
// toggling the table view, ...) does not re-render the board grid: the
// connected `OverviewCards` would otherwise rebuild every `BoardBrief`.
export const Overview: FC<InputProps> = React.memo(
    ({ showTable = false, showConfigById }: InputProps) =>
        showTable ? <OverviewTable /> : <OverviewCards showConfigById={showConfigById} />
);
