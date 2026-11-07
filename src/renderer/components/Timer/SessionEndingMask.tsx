import { Button, ConfigProvider, Row } from 'antd';
import { LONG_BREAK_INTERVAL } from './action';
import { FocusSelector } from './FocusSelector';
import { PomodoroNumView } from './PomodoroNumView';
import React from 'react';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import type { KanbanBoardState } from '../Kanban/Board/action';
import { PomodoroRecord } from '../../monitor/type';
import { NIGHT_THEME_ID } from '../../theme/tokens';
import { t } from '../../i18n';

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

const PomodoroSummary = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    margin-top: 2em;
`;

export interface InputProps {
    showMask: boolean;
    onCancel: () => void;
    onStart: () => void;
    pomodoros: PomodoroRecord[];
    newPomodoro?: PomodoroRecord;
    extendCurrentSession: (timeInMinutes: number) => void;
}

export interface MaskProps extends InputProps {
    isFocusing: boolean;
    boardId?: string;
    boards: KanbanBoardState;
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
    const wasShown = React.useRef(props.showMask);
    React.useEffect(() => {
        // Re-arm on every open. Changing `boardId` while the mask is up does not
        // reset the acknowledgement: picking a project is what unlocks there,
        // not the moment the selector changes.
        if (props.showMask && !wasShown.current) {
            setAcknowledged(false);
            setEditing(false);
        }
        wasShown.current = props.showMask;
    }, [props.showMask]);

    const onProjectClick = (event: React.MouseEvent) => {
        event.stopPropagation();
    };
    const onStartClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        props.onStart();
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
        props.onCancel();
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

    return (
        <Mask
            $nightTheme={props.nightTheme}
            style={{ display: props.showMask ? 'flex' : 'none' }}
            onClick={locked ? undefined : onBackgroundClick}
        >
            <MaskInnerContainer $compact={props.compact}>
                <Row onClick={onProjectClick} justify="center" style={{ width: '100%' }}>
                    {props.isFocusing ? (
                        showPicker ? (
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
                        ) : (
                            <ProjectName $compact={props.compact} onClick={() => setEditing(true)}>
                                {props.boards[props.boardId!]?.name}
                            </ProjectName>
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
    );
};

export const TimerMask = connect((state: RootState, _props: InputProps) => ({
    isFocusing: state.timer.isFocusing,
    isLongBreak: !((state.timer.iBreak + 1) % LONG_BREAK_INTERVAL),
    boardId: state.timer.boardId,
    boards: state.kanban.boards,
    compact: state.timer.compact,
    nightTheme: state.timer.themeId === NIGHT_THEME_ID,
}))(TimerMaskInner);
