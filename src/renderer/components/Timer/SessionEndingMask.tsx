import { Button, ConfigProvider, Row, Select } from 'antd';
import { LONG_BREAK_INTERVAL } from './action';
import { FocusSelector } from './FocusSelector';
import { PomodoroNumView } from './PomodoroNumView';
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import type { KanbanBoardState } from '../Kanban/Board/action';
import type { CardsState } from '../Kanban/Card/action';
import type { ListsState } from '../Kanban/type';
import { PomodoroRecord } from '../../monitor/type';
import { NIGHT_THEME_ID } from '../../theme/tokens';
import { t } from '../../i18n';

const { Option } = Select;

const ButtonContainer = styled.div`
    position: absolute;
    top: 16px;
    right: 16px;
`;

const Mask = styled.div<{ $nightTheme: boolean }>`
    left: 0;
    top: 0;
    height: 100%;
    width: 100%;
    position: fixed;
    /* The ending screen is an alert, not another piece of page surface: it
       follows the background opacity so the desktop still shows through, but
       the value is floored so the alert can never be tuned away into white text
       floating over the desktop. */
    background-color: ${({ $nightTheme }) =>
        $nightTheme
            ? 'color-mix(in srgb, #27323a max(var(--pl-theme-bg-opacity), 60%), transparent)'
            : 'color-mix(in srgb, #dd5339 max(var(--pl-theme-bg-opacity), 60%), transparent)'};
    text-align: center;
    color: white !important;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    /* Full-viewport position: fixed layer: its corners are clipped by Main's
       rounded overflow now (Main is the containing block for fixed
       descendants, see the transform there), so it needs no radius of its
       own -- the one added when the window got rounded corners was a patch. */
`;

const MaskInnerContainer = styled.div<{ $compact: boolean }>`
    max-width: 500px;
    width: ${({ $compact }) => ($compact ? 'calc(100% - 24px)' : '100%')};
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    /* The session summary is copyable, like every other feedback surface. */
    user-select: text;
`;

const ProjectName = styled.h1<{ $compact: boolean }>`
    font-size: ${({ $compact }) => ($compact ? '2em' : '4em')};
    transition: color 0.4s;
    color: black;
    cursor: pointer;
    line-height: 1em;
    margin: 0;
    width: 100%;
    text-align: center;
    &:hover {
        color: white;
    }
`;

/** The project selector sits on one line with its acknowledgement button. */
const PickerRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 1em;
`;

/**
 * The card row under the project name. It mirrors the project: a clickable
 * name that opens the same edit state, a dashed placeholder when the focused
 * list is empty, and nothing at all when there is exactly one card -- that one
 * is credited automatically.
 */
const CardRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 0.5em;
`;

/**
 * Same affordance as the card column in the History day editor: a dashed
 * underline says "this opens something", without the link blue. `min-width: 0`
 * is what lets the title ellipsize instead of pushing the count out of the row.
 */
const CardName = styled.button`
    min-width: 0;
    max-width: 100%;
    padding: 2px 4px;
    border: none;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.5);
    background: transparent;
    color: white;
    font-size: 1.1em;
    line-height: 1.4;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
        background-color: rgba(255, 255, 255, 0.14);
    }
`;

const CardCount = styled.span`
    flex: none;
    font-size: 0.85em;
    opacity: 0.75;
`;

const CardPlaceholder = styled.span`
    padding: 2px 6px;
    font-size: 1.1em;
    line-height: 1.4;
    opacity: 0.7;
`;

const PomodoroSummary = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-top: 2em;
`;

export interface InputProps {
    showMask: boolean;
    /** `null` is an explicit "no card"; `undefined` means no pick was made. */
    onCancel: (cardId?: string | null) => void;
    onStart: (cardId?: string | null) => void;
    pomodoros: PomodoroRecord[];
    newPomodoro?: PomodoroRecord;
    extendCurrentSession: (timeInMinutes: number) => void;
}

export interface MaskProps extends InputProps {
    isFocusing: boolean;
    boardId?: string;
    boards: KanbanBoardState;
    lists: ListsState;
    cards: CardsState;
    isLongBreak: boolean;
    compact: boolean;
    nightTheme: boolean;
}

const TimerMaskInner = (props: MaskProps) => {
    const { extendCurrentSession } = props;
    /**
     * A focus session that ran without a project cannot be dismissed by clicking
     * the background: one stray click would credit it to nobody with no way
     * back. Picking a project ends that state by itself (the mask then shows the
     * chosen name), and Confirm covers the case where the user leaves it empty.
     */
    const needsProject = props.isFocusing && props.boardId === undefined;
    const [acknowledged, setAcknowledged] = React.useState(false);
    // The big project name stays the default state; clicking it swaps in the
    // selector again so a wrong pick can be corrected.
    const [editing, setEditing] = React.useState(false);
    const locked = needsProject && !acknowledged;
    const showPicker = needsProject || editing;

    /**
     * Cards the finished session can be credited to: the focused list of the
     * project it will be filed under. A card that disappeared from `cards`
     * (deleted on the Kanban page mid-session) is skipped -- crediting it would
     * only leave a dangling reference.
     */
    const focusedListId =
        props.boardId === undefined ? undefined : props.boards[props.boardId]?.focusedList;
    const candidates = React.useMemo(() => {
        const ids = focusedListId === undefined ? [] : (props.lists[focusedListId]?.cards ?? []);
        return ids.filter((cardId) => props.cards[cardId] !== undefined);
    }, [focusedListId, props.lists, props.cards]);

    // One session belongs to at most one card. `undefined` means "no card",
    // which is also what an empty focused list yields.
    const [chosenCardId, setChosenCardId] = React.useState<string | undefined>(undefined);

    // Starts empty (not `props.showMask`): a mask that is already up on the
    // first render still has to pick its defaults, exactly like one that opens
    // later.
    const wasShown = React.useRef(false);
    const lastBoardId = React.useRef(props.boardId);
    React.useEffect(() => {
        // Re-arm on every open. Changing `boardId` while the mask is up does not
        // reset the acknowledgement: picking a project is what unlocks there,
        // not the moment the selector changes.
        const opened = props.showMask && !wasShown.current;
        // A card belongs to a list, and a list to a board, so a new project
        // invalidates the card pick rather than carrying it over.
        const boardChanged = lastBoardId.current !== props.boardId;
        wasShown.current = props.showMask;
        lastBoardId.current = props.boardId;

        if (opened) {
            setAcknowledged(false);
            setEditing(false);
        }
        if (!props.showMask) {
            return;
        }

        // Default to the same card a confirmation without an explicit pick
        // credits (see `Timer.defaultCardId`): the first card of the focused
        // list. An explicit "no card" survives, and so does a still-valid pick.
        setChosenCardId((prev) =>
            opened || boardChanged || (prev !== undefined && !candidates.includes(prev))
                ? candidates[0]
                : prev
        );
    }, [props.showMask, props.boardId, candidates]);

    const onProjectClick = (event: React.MouseEvent) => {
        event.stopPropagation();
    };
    const onStartClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        props.onStart(chosenCardId ?? null);
    };

    /** Releases the lock only; the session is saved by the next background click. */
    const onConfirmClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        setAcknowledged(true);
    };

    /** In edit mode the first background click puts the name heading back. */
    const onBackgroundClick = () => {
        if (editing) {
            setEditing(false);
            return;
        }
        props.onCancel(chosenCardId ?? null);
    };

    const extend10 = React.useCallback(
        (event: any) => {
            event.stopPropagation();
            extendCurrentSession(10);
        },
        [extendCurrentSession]
    );
    const extend5 = React.useCallback(
        (event: any) => {
            event.stopPropagation();
            extendCurrentSession(5);
        },
        [extendCurrentSession]
    );

    /** Card this session will be credited to; `undefined` means "no card". */
    const cardName =
        chosenCardId === undefined
            ? t('timer.session.noCard')
            : props.cards[chosenCardId]?.title || t('kanban.cardPicker.untitled');
    // One card is credited automatically and needs no row. Zero cards get a
    // placeholder so the session's missing attribution is visible instead of
    // silent.
    const hasCardRow = props.isFocusing && candidates.length !== 1;

    const cardNameRow = hasCardRow ? (
        <CardRow>
            {candidates.length === 0 ? (
                <CardPlaceholder>{t('timer.session.noCard')}</CardPlaceholder>
            ) : (
                <>
                    <CardName type="button" title={cardName} onClick={() => setEditing(true)}>
                        {cardName}
                    </CardName>
                    <CardCount>{t('timer.session.cardCount', candidates.length)}</CardCount>
                </>
            )}
        </CardRow>
    ) : undefined;

    return (
        <>
            <Mask
                $nightTheme={props.nightTheme}
                role="group"
                aria-label={t('timer.maskLabel')}
                style={{ display: props.showMask ? 'flex' : 'none' }}
                onClick={locked ? undefined : onBackgroundClick}
            >
                <MaskInnerContainer $compact={props.compact}>
                    <Row onClick={onProjectClick} justify="center" style={{ width: '100%' }}>
                        {props.isFocusing ? (
                            showPicker ? (
                                <>
                                    <PickerRow>
                                        <FocusSelector
                                            width={props.compact ? 200 : 240}
                                            id="focus-selector-mask"
                                            onSelected={() => setEditing(false)}
                                        />
                                        {locked ? (
                                            <Button onClick={onConfirmClick}>
                                                {t('timer.session.confirm')}
                                            </Button>
                                        ) : undefined}
                                    </PickerRow>
                                    {candidates.length > 1 ? (
                                        <PickerRow>
                                            {/* Same control as the project row: same
                                                width, same motion token, same grey
                                                "no card" option. */}
                                            <ConfigProvider
                                                theme={{ token: { motionDurationMid: '120ms' } }}
                                            >
                                                <Select
                                                    value={chosenCardId ?? ''}
                                                    style={{ width: props.compact ? 200 : 240 }}
                                                    aria-label={t('timer.session.cardSelector')}
                                                    onChange={(cardId: string) => {
                                                        setChosenCardId(cardId || undefined);
                                                        // Picking closes the edit state,
                                                        // exactly like the project selector.
                                                        setEditing(false);
                                                    }}
                                                    id="card-selector-mask"
                                                >
                                                    {candidates.map((cardId) => (
                                                        <Option key={cardId} value={cardId}>
                                                            {props.cards[cardId]?.title ||
                                                                t('kanban.cardPicker.untitled')}
                                                        </Option>
                                                    ))}
                                                    <Option value="" style={{ color: '#bfbfbf' }}>
                                                        {t('timer.session.noCard')}
                                                    </Option>
                                                </Select>
                                            </ConfigProvider>
                                        </PickerRow>
                                    ) : undefined}
                                </>
                            ) : (
                                <>
                                    <ProjectName
                                        $compact={props.compact}
                                        onClick={() => setEditing(true)}
                                    >
                                        {props.boards[props.boardId!]?.name}
                                    </ProjectName>
                                    {cardNameRow}
                                </>
                            )
                        ) : (
                            <ProjectName $compact={props.compact}>
                                {t('timer.session.break')}
                            </ProjectName>
                        )}
                        <h1
                            style={{
                                color: 'white',
                                fontSize: props.compact ? '2em' : '3.5em',
                                marginBottom: props.compact ? '0.6em' : '1em',
                                width: '100%',
                            }}
                        >
                            {t('timer.session.finished')}
                        </h1>
                    </Row>
                    <ConfigProvider wave={{ disabled: true }}>
                        <Button size="large" onClick={onStartClick}>
                            {!props.isFocusing
                                ? t('timer.session.startFocusing')
                                : props.isLongBreak
                                  ? t('timer.session.startLongBreak')
                                  : t('timer.session.startShortBreak')}
                        </Button>
                    </ConfigProvider>
                    <PomodoroSummary>
                        <h1 style={{ color: 'white', margin: 0 }}>
                            {t('timer.session.todayPomodoros')}
                        </h1>
                        <PomodoroNumView
                            pomodoros={props.pomodoros}
                            color={'#f9ec52'}
                            showNum={false}
                            newPomodoro={props.newPomodoro}
                            compact={props.compact}
                        />
                    </PomodoroSummary>
                </MaskInnerContainer>
                {props.isFocusing ? (
                    <ButtonContainer>
                        <Button
                            style={{ margin: 4 }}
                            title={t('timer.session.extend5')}
                            onClick={extend5}
                        >
                            +5
                        </Button>
                        <Button
                            style={{ margin: 4 }}
                            title={t('timer.session.extend10')}
                            onClick={extend10}
                        >
                            +10
                        </Button>
                    </ButtonContainer>
                ) : undefined}
            </Mask>
        </>
    );
};

export const TimerMask = connect((state: RootState, _props: InputProps) => ({
    isFocusing: state.timer.isFocusing,
    isLongBreak: !((state.timer.iBreak + 1) % LONG_BREAK_INTERVAL),
    boardId: state.timer.boardId,
    boards: state.kanban.boards,
    lists: state.kanban.lists,
    cards: state.kanban.cards,
    compact: state.timer.compact,
    nightTheme: state.timer.themeId === NIGHT_THEME_ID,
}))(TimerMaskInner);
