import React, { useState, MouseEvent } from 'react';
import { actions as timerActions, TimerManager } from '../../Timer/action';
import { connect } from 'react-redux';
import { RootState } from '../../../reducers';
import { actions } from './action';
import { actions as kanbanActions } from '../action';
import { Dispatch } from 'redux';
import styled, { keyframes } from 'styled-components';
import { CardsState } from '../Card/action';
import { Button, Divider } from 'antd';
import { AntdIcon as Icon } from '../../antdIcon';
import { feedback, FEEDBACK_MESSAGES } from '../../feedback';
import { Badge, TimeBadge } from '../../../../components/Visualization/Badge/Badge';
import formatMarkdown from '../Card/formatMarkdown';
import { IdTrend } from '../../Visualization/ProjectTrend';
import { formatTimeYmdHm } from '../../Visualization/Timeline';
import { CreatedTime } from '../style/CreatedTime';
import { BadgeHolder } from '../style/Badge';
import { Markdown } from '../style/Markdown';
import { ListsCountBar } from '../../Visualization/Bar';
import { PomodoroDot } from '../../Visualization/PomodoroDot';
import { KanbanBoard, ListsState } from '../type';
import { memorizeDispatchToProps } from '../../../utils';
import { PlayPauseButton } from './PlayPauseButton';
import { Pin } from '../../../../components/common/Pin/Pin';

const BriefCard = styled.div`
    word-break: break-word;
    position: relative;
    /* Keep the card a stacking context so the negative-z-index shadow
       pseudo-element paints above the card's own background (but below the
       content) instead of disappearing behind it. */
    isolation: isolate;
    display: block;
    padding: 6px;
    background-color: var(--pl-bg-elevated);
    color: var(--pl-text);
    margin: 6px;
    border-radius: 6px;
    width: 260px;
    min-height: 100px;
    cursor: pointer;

    /* The shadow used to be a box-shadow transition on the card itself.
       Shadows are paint-only: every frame of every hovered card re-rasterized
       the blur, and sweeping the mouse across the grid kept several of those
       transitions alive at once. Painting the shadow once on hover (instead of
       fading a layer) is the cheapest option: there is no per-frame work at
       all while the pointer moves from card to card. */
    &::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        box-shadow: 2px 2px 4px 4px var(--pl-shadow);
        opacity: 0;
        pointer-events: none;
    }

    &:hover {
        z-index: 100;

        &::before {
            opacity: 1;
        }

        /* Hover-only visuals are CSS driven so crossing a card does not
           re-render it. The pin's opacity is also handled here (see Pin). */
        .pl-trend {
            opacity: 1;
        }

        .pl-pin .anticon {
            opacity: 1;
        }
    }

    .pl-trend {
        opacity: 0;
    }
`;

/**
 * Pointer dwell required before the hover-only trend chart is mounted. A card
 * crossed during a fast sweep never reaches this, so it never runs a session
 * query or builds an SVG; hovering to read the trend still feels immediate.
 */
export const TREND_HOVER_DELAY_MS = 200;

/**
 * The trend chart used to be revealed by an infinite `clip-path` animation on
 * the SVG. `clip-path` is a paint property, so Chromium re-rasterized the
 * gradient-stroked path on every frame for as long as a board card was
 * hovered (and briefly for every card crossed during a fast sweep).
 *
 * The reveal now slides one solid cover with `transform` only. It plays once,
 * the first time this card's chart is shown: after that the cover is removed,
 * so sweeping the pointer across already visited cards starts no animation at
 * all and leaves the chart completely static. Combining the 0.2s animation
 * delay with the dwell above keeps the first visible frame at the same moment
 * as before (0.4s after the pointer enters).
 */
const trendReveal = keyframes`
    0% {
        transform: translateX(0);
    }
    100% {
        transform: translateX(100%);
    }
`;

/* Horizontal padding of the card's Content block. The trend overlay is
   absolutely positioned against Content's padding box, so it has to offset
   itself by the same amount to line up with the text and stay inside the
   card. (Width: 100% used to start at the content edge but measure the full
   padding box, pushing the chart -- and its solid reveal cover -- a few
   pixels past the card's right edge.) */
const CONTENT_HORIZONTAL_PADDING = 8;

const AnimTrend = styled.div`
    position: absolute;
    left: ${CONTENT_HORIZONTAL_PADDING}px;
    right: ${CONTENT_HORIZONTAL_PADDING}px;
    height: 40px;
    z-index: -1;
    bottom: 16px;
    /* The cover slides past the chart bounds; clip it to the chart area. */
    overflow: hidden;
    pointer-events: none;
`;

const TrendChart = styled.div`
    width: 100%;
    height: 100%;
    opacity: 0.5;
`;

/* The cover slides off to the right and stops there. It is only rendered for
   the first reveal (the component unmounts it on animation end), so moving
   the pointer across already visited cards does not start any animation. */
const TrendCover = styled.div`
    position: absolute;
    inset: 0;
    background-color: var(--pl-bg-elevated);
    animation: ${trendReveal} 0.6s linear 0.2s 1 both;
`;

const Content = styled.div`
    position: relative;
    padding: 0 ${CONTENT_HORIZONTAL_PADDING}px;
`;

const Header = styled.div`
    margin-top: 6px;
    margin-bottom: 4px;
    padding: 0 6px;
    display: flex;
    justify-content: space-between;

    .header-left {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    h1 {
        max-width: 180px;
        min-width: 0;
        margin: 0;
        display: flex;
        align-items: baseline;
        font-size: 16px;

        .brief-title {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }
    }
`;

interface InputProps {
    // Receives the board id so the overview can pass one stable callback for
    // every card instead of a fresh closure per card and render.
    onClick?: (boardId: string) => void;
}

interface Props extends KanbanBoard, InputProps {
    setCurrentBoardAsFocusingTarget: () => void;
    timerManager?: TimerManager;
    isTimerRunning: boolean;
    configure: () => void;
    listsById: ListsState;
    cardsById: CardsState;
    setPin: (pin: boolean) => void;
    isFocusingOnThisBoard: boolean;
}

const _BoardBrief: React.FC<Props> = React.memo((props: Props) => {
    const {
        name,
        doneList,
        onClick,
        isFocusingOnThisBoard,
        isTimerRunning,
        relatedSessions = [],
        _id,
        timerManager,
        setCurrentBoardAsFocusingTarget,
        setPin,
        pin,
    } = props;
    // Keep the hook order stable even while a removed board is still being
    // rendered with an undefined id. The early return now happens after every
    // hook below.
    //
    // Hover styling (shadow, pin, chart visibility) is pure CSS, so crossing a
    // card no longer renders this component. These handlers only wait for a
    // dwell before lazily mounting the trend chart.
    //
    // The trend chart used to mount (and issue its per-board session query) as
    // soon as the pointer touched a card. Mount it on the first sustained
    // hover, then keep it so later hovers are instant.
    const [showTrend, setShowTrend] = useState(false);
    // The reveal animation is a first-run affordance only. Once the cover has
    // finished sliding off, drop it: later hovers then show the chart
    // immediately with no animation or compositing work.
    const [trendRevealed, setTrendRevealed] = useState(false);
    const onTrendRevealEnd = React.useCallback(() => setTrendRevealed(true), []);
    const trendTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelTrendTimer = React.useCallback(() => {
        if (trendTimer.current !== null) {
            clearTimeout(trendTimer.current);
            trendTimer.current = null;
        }
    }, []);
    const onMouseEnter = () => {
        if (showTrend || trendTimer.current !== null) {
            return;
        }
        trendTimer.current = setTimeout(() => {
            trendTimer.current = null;
            setShowTrend(true);
        }, TREND_HOVER_DELAY_MS);
    };
    const onMouseLeave = () => {
        cancelTrendTimer();
    };
    React.useEffect(() => cancelTrendTimer, [cancelTrendTimer]);

    // Aggregating every card of this board ran on each render (including the
    // hover state updates below). It only depends on the board's own lists and
    // cards, so memoize it and avoid mutating the store's card objects.
    const { estimatedLeftTimeSum, actualTimeSum, errorSum, n, showErr } = React.useMemo(() => {
        let estimatedLeft = 0;
        let actualSum = 0;
        let errorSum_ = 0;
        let doneCount = 0;
        let showErr_ = false;
        const lists = props.lists ?? [];
        const listsById = props.listsById ?? {};
        const cardsById = props.cardsById ?? {};

        for (const listId of lists) {
            const list = listsById[listId];
            if (list === undefined) {
                continue;
            }

            const isDone = listId === doneList;
            for (const cardId of list.cards) {
                const card = cardsById[cardId];
                if (card === undefined) {
                    continue;
                }

                const { actual, estimated } = card.spentTimeInHour;
                let err = 0;
                if (isDone && actual !== 0 && estimated !== 0) {
                    err = (Math.abs(estimated - actual) / actual) * 100;
                    showErr_ = true;
                }

                estimatedLeft += isDone ? 0 : Math.max(0, estimated - actual);
                actualSum += actual;
                errorSum_ += err;
                if (isDone) {
                    doneCount += 1;
                }
            }
        }

        return {
            estimatedLeftTimeSum: estimatedLeft,
            actualTimeSum: actualSum,
            errorSum: errorSum_,
            n: doneCount,
            showErr: showErr_,
        };
    }, [props.lists, props.listsById, props.cardsById, doneList]);

    const descriptionHtml = React.useMemo(
        () => (props.description ? formatMarkdown(props.description) : undefined),
        [props.description]
    );

    const avgErr = errorSum / n;
    let acc;
    let accColor;
    if (avgErr < 5) {
        acc = 'Perfect';
        accColor = 'green';
    } else if (avgErr < 10) {
        acc = 'Good';
        accColor = 'green';
    } else if (avgErr < 20) {
        acc = 'Fair';
        accColor = '#ffe313';
    } else if (avgErr < 30) {
        acc = 'Poor';
        accColor = '#ffa027';
    } else {
        acc = 'Bad';
        accColor = '#ff350e';
    }

    const onSettingClick = (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        props.configure();
        props.onSettingClick?.(props._id);
    };

    const onStartFocusingClick = React.useCallback(
        (event: MouseEvent) => {
            event.stopPropagation();
            setCurrentBoardAsFocusingTarget();
            if (!timerManager) {
                return;
            }

            if (isFocusingOnThisBoard && isTimerRunning) {
                timerManager.pause();
                feedback.toast({ kind: 'info', content: FEEDBACK_MESSAGES.kanban.paused });
            } else {
                timerManager.start(_id);
                feedback.toast({
                    kind: 'success',
                    content: FEEDBACK_MESSAGES.kanban.startFocusing,
                });
            }
        },
        [_id, isFocusingOnThisBoard, isTimerRunning, timerManager, setCurrentBoardAsFocusingTarget]
    );
    const onPinClick = React.useCallback(() => setPin(!pin), [setPin, pin]);

    if (props._id === undefined) {
        return <></>;
    }

    return (
        <BriefCard
            onClick={onClick ? () => onClick(props._id) : undefined}
            onMouseLeave={onMouseLeave}
            onMouseEnter={onMouseEnter}
            className={'kanban-brief-card'}
            data-tour={'kanban-brief-card'}
        >
            <Header>
                <div className="header-left">
                    <h1>
                        <span className="brief-title" title={name}>
                            {name}
                        </span>
                        <Pin isPin={!!props.pin} onClick={onPinClick} style={{ marginLeft: 4 }} />
                    </h1>
                    {props.createdTime !== undefined ? (
                        <CreatedTime>Created: {formatTimeYmdHm(props.createdTime)}</CreatedTime>
                    ) : undefined}
                </div>
                <span>
                    <PlayPauseButton
                        onClick={onStartFocusingClick}
                        showPlay={!(isFocusingOnThisBoard && isTimerRunning)}
                        size={'small'}
                    />
                    {props.onSettingClick ? (
                        <Button
                            type={'default'}
                            icon={<Icon type={'setting'} />}
                            shape={'circle'}
                            onClick={onSettingClick}
                            size={'small'}
                        />
                    ) : undefined}
                </span>
            </Header>
            <Content>
                {descriptionHtml ? (
                    <Markdown dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                ) : undefined}
                <ListsCountBar
                    boardId={props._id}
                    height={props.createdTime !== undefined ? 26 : 40}
                />
                {relatedSessions.length && showTrend ? (
                    <AnimTrend className="pl-trend" data-testid="trend-animation">
                        <TrendChart>
                            <IdTrend boardId={props._id} />
                        </TrendChart>
                        {trendRevealed ? undefined : (
                            <TrendCover
                                data-testid="trend-cover"
                                onAnimationEnd={onTrendRevealEnd}
                            />
                        )}
                    </AnimTrend>
                ) : undefined}
            </Content>
            <Divider style={{ margin: '6px 0' }} />
            <BadgeHolder>
                <PomodoroDot num={relatedSessions.length} />
                {actualTimeSum + estimatedLeftTimeSum ? (
                    <TimeBadge spentTime={actualTimeSum} leftTime={estimatedLeftTimeSum} />
                ) : undefined}
                {showErr ? (
                    <Badge
                        type={'accuracy'}
                        value={acc}
                        color={accColor}
                        title={'Estimate accuracy'}
                    />
                ) : undefined}
            </BadgeHolder>
        </BriefCard>
    );
});

interface InputProps {
    boardId: string;
    onSettingClick?: (boardId: string) => void;
}

const memorizedMapping = memorizeDispatchToProps(
    (dispatch: Dispatch, props: InputProps) => ({
        setCurrentBoardAsFocusingTarget: () => {
            dispatch(timerActions.setBoardId(props.boardId));
        },
        configure: () => {
            dispatch(kanbanActions.setConfiguringBoardId(props.boardId));
        },
        setPin: (pin: boolean) => {
            actions.setPin(props.boardId, pin)(dispatch);
        },
    }),
    (props: InputProps) => ({
        setCurrentBoardAsFocusingTarget: [props.boardId],
        configure: [props.boardId],
        setPin: [props.boardId],
    })
);

export const BoardBrief = connect(
    (state: RootState, props: InputProps) => ({
        ...state.kanban.boards[props.boardId],
        listsById: state.kanban.lists,
        cardsById: state.kanban.cards,
        isFocusingOnThisBoard: state.timer.boardId === props.boardId,
        isTimerRunning: state.timer.isRunning && state.timer.isFocusing,
        timerManager: state.timer.timerManager,
    }),
    memorizedMapping
)(_BoardBrief);
