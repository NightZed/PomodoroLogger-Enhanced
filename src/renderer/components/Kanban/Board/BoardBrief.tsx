import React, { useCallback, useState, MouseEvent } from 'react';
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
    display: block;
    padding: 6px;
    background-color: var(--pl-bg-elevated);
    color: var(--pl-text);
    margin: 6px;
    border-radius: 6px;
    width: 260px;
    min-height: 100px;
    cursor: pointer;
    transition: box-shadow 0.5s, transform 0.5s;

    &:hover {
        box-shadow: 2px 2px 4px 4px var(--pl-shadow);
        transform: translate(-3px -3px);
        z-index: 100;
    }
`;

const clipAnimation = keyframes`
  0% {
    clip-path: inset(0 100% 0 0);
  }
  20% {
    clip-path: inset(0 0 0 0);
  }
  85% {
    clip-path: inset(0 0 0 0);
  }
  100% {
    clip-path: inset(0 0 0 100%);
  }
`;

const AnimTrend = styled.div`
    position: absolute;
    width: 100%;
    height: 40px;
    z-index: -1;
    opacity: 0.5;
    bottom: 16px;

    svg {
        animation: ${clipAnimation} 3s linear infinite;
        animation-delay: 0.4s;
        clip-path: inset(100%);
    }
`;

const Content = styled.div`
    position: relative;
    padding: 0 8px;
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
    if (props._id === undefined) {
        return <></>;
    }

    const {
        name,
        lists,
        listsById,
        doneList,
        cardsById,
        onClick,
        isFocusingOnThisBoard,
        isTimerRunning,
    } = props;
    const [hover, setHover] = useState(false);
    // The trend chart is only visible while the card is hovered, but it used
    // to mount (and issue its per-board session query) for every brief card as
    // soon as the overview opened. Mount it on the first hover instead, then
    // keep it so later hovers are instant.
    const [showTrend, setShowTrend] = useState(false);
    const onMouseEnter = () => {
        setHover(true);
        setShowTrend(true);
    };
    const onMouseLeave = () => {
        setHover(false);
    };

    // Aggregating every card of this board ran on each render (including the
    // hover state updates below). It only depends on the board's own lists and
    // cards, so memoize it and avoid mutating the store's card objects.
    const { estimatedLeftTimeSum, actualTimeSum, errorSum, n, showErr } = React.useMemo(() => {
        let estimatedLeft = 0;
        let actualSum = 0;
        let errorSum_ = 0;
        let doneCount = 0;
        let showErr_ = false;

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
    }, [lists, listsById, cardsById, doneList]);

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
            props.setCurrentBoardAsFocusingTarget();
            if (!props.timerManager) {
                return;
            }

            if (isFocusingOnThisBoard && isTimerRunning) {
                props.timerManager.pause();
                feedback.toast({ kind: 'info', content: FEEDBACK_MESSAGES.kanban.paused });
            } else {
                props.timerManager.start(props._id);
                feedback.toast({
                    kind: 'success',
                    content: FEEDBACK_MESSAGES.kanban.startFocusing,
                });
            }
        },
        [props._id, isFocusingOnThisBoard, isTimerRunning, props.timerManager]
    );

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
                        <Pin
                            isPin={!!props.pin}
                            onClick={useCallback(
                                () => props.setPin(!props.pin),
                                [props._id, props.pin]
                            )}
                            isHover={hover}
                            style={{ marginLeft: 4 }}
                        />
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
                {props.relatedSessions.length && showTrend ? (
                    <AnimTrend style={{ display: hover ? undefined : 'none' }}>
                        <IdTrend boardId={props._id} />
                    </AnimTrend>
                ) : undefined}
            </Content>
            <Divider style={{ margin: '6px 0' }} />
            <BadgeHolder>
                <PomodoroDot num={props.relatedSessions.length} />
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
