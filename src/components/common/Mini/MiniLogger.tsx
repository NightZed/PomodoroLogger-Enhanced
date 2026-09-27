import { Button } from 'antd';
import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { PomodoroRecord } from '../../../renderer/monitor/type';

const fadeIn = keyframes`
    0% {
        opacity: 1;
        transform: scale(1.1);
    }

    20% {
        opacity: 0.2;
        transform: scale(1);
    }

    100% {
        opacity: 0.2;
    }
`;

interface LineProps {
    anime: boolean;
}

const Line = styled.line<LineProps>`
    ${({ anime }) =>
        anime
            ? css`
                  animation: ${fadeIn} 800ms linear infinite;
              `
            : ''}
`;

const StyledLogger = styled.div`
    /* Must match the mini window content size set in src/main/ipc/ipc.ts
       (setContentSize(200, 90)); Application.tsx hides the 1px tabs-bar border
       while minimized so the rows fill the strip exactly (45px + 45px).
       The explicit width keeps the control cluster fixed and lets the task
       name truncate instead of stretching the content region. */
    width: 200px;
    height: 90px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    /* Frameless window: dragging anywhere except the buttons moves the strip. */
    -webkit-app-region: drag;

    * {
        user-select: none;
    }

    .task-row {
        position: relative;
        box-sizing: border-box;
        height: 45px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 8px;
        overflow: hidden;
    }

    /* Divider between the rows -- inset so it never touches the left/right
       window edges. Drawn as an overlay so both rows stay exactly equal. */
    .task-row::after {
        content: '';
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 0;
        height: 1px;
        background: var(--pl-border);
    }

    .task {
        color: var(--pl-text);
        font-size: 12px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        min-width: 0;
        max-width: 100%;
    }

    .control-row {
        box-sizing: border-box;
        height: 45px;
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 0 8px;
    }

    /* Fixed width: exactly two 24px buttons + one 8px gap. The cluster keeps
       the same size whether or not a project is selected; an empty side still
       reserves its width so the timer stays centered. */
    .btn-side {
        width: 56px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        -webkit-app-region: no-drag;
    }

    .btn-side.left {
        justify-content: flex-end;
    }

    .btn-side.right {
        justify-content: flex-start;
    }

    /* Minimal icon-only buttons: no border/background until hovered */
    .btn-side button {
        box-sizing: border-box;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        background: transparent;
        box-shadow: none;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--pl-text-secondary);
        flex-shrink: 0;
    }

    .btn-side button:hover,
    .btn-side button:focus {
        background-color: var(--pl-bg-hover);
        color: var(--pl-text);
    }

    /* Disabled (e.g. Clear while waiting for confirmation after a rest):
       dimmed and not clickable, and the hover highlight must not show. */
    .btn-side button:disabled,
    .btn-side button:disabled:hover,
    .btn-side button:disabled:focus {
        background-color: transparent;
        color: var(--pl-text-secondary);
        opacity: 0.35;
        cursor: not-allowed;
    }

    .btn-side button .anticon {
        font-size: 14px;
    }

    .btn-side button.btn-extend {
        width: 24px;
        padding: 0;
        font-size: 11px;
        border-radius: 12px;
    }

    .timer-svg {
        flex-shrink: 0;
        margin: 0 8px;
    }
`;

interface Props {
    play: () => void;
    pause: () => void;
    done: () => void;
    clear: () => void;
    switch: () => void;
    expand: () => void;
    confirm: () => void;
    confirmAndStartNextSession: () => void;
    extendCurrentSession: (minute: number) => void;
    time: string;
    percentage: number;
    isRunning: boolean;
    isFocusing: boolean;
    isConfirming: boolean;
    task: string;
    style?: React.CSSProperties;
    stagedPomodoro?: PomodoroRecord;
}

export class MiniLogger extends React.Component<Props> {
    constructor(props: Props) {
        super(props);
    }

    clear = () => {
        this.setState({ percentage: 0 });
        this.props.clear();
    };

    extend5Minutes = () => {
        this.props.extendCurrentSession(5);
    };

    extend10Minutes = () => {
        this.props.extendCurrentSession(10);
    };

    private getControlRow(): React.ReactNode {
        const {
            isRunning,
            play,
            pause,
            percentage,
            isFocusing,
            isConfirming,
            confirmAndStartNextSession,
        } = this.props;

        const left = isConfirming ? (
            <>
                <Button
                    size="small"
                    icon="caret-right"
                    onClick={confirmAndStartNextSession}
                    title="Start Next Session"
                />
                <Button size="small" icon="check" title="Done" onClick={this.props.confirm} />
            </>
        ) : (
            <>
                {isRunning ? (
                    <Button size="small" icon="pause" title="Pause (F6)" onClick={pause} />
                ) : (
                    <Button size="small" icon="caret-right" title="Start (F5)" onClick={play} />
                )}
                {percentage === 0 ? (
                    <Button
                        size="small"
                        icon="swap"
                        title="Switch Mode (Tab)"
                        onClick={this.props.switch}
                    />
                ) : (
                    <Button size="small" icon="check" title="Done" onClick={this.props.done} />
                )}
            </>
        );

        const right =
            isConfirming && isFocusing ? (
                // A focus session just ended: offer the extend options.
                <>
                    <Button
                        size="small"
                        className="btn-extend"
                        onClick={this.extend5Minutes}
                        title="Extend 5 minutes"
                    >
                        +5
                    </Button>
                    <Button
                        size="small"
                        className="btn-extend"
                        onClick={this.extend10Minutes}
                        title="Extend 10 minutes"
                    >
                        +10
                    </Button>
                </>
            ) : (
                // Normal mode, or a rest session just ended: the right side
                // always stays filled. Clearing is not allowed while waiting
                // for confirmation, but leaving mini mode still works.
                <>
                    <Button
                        size="small"
                        icon="close"
                        title="Clear"
                        onClick={this.clear}
                        disabled={isConfirming}
                    />
                    <Button
                        size="small"
                        icon="fullscreen"
                        title="Expand (F12)"
                        onClick={this.props.expand}
                    />
                </>
            );

        return (
            <div className="control-row">
                <div className="btn-side left">{left}</div>
                {this.renderTimer()}
                <div className="btn-side right">{right}</div>
            </div>
        );
    }

    /** Hover label for the countdown: which state the current session is in. */
    private getTimerStateLabel(): string {
        const { isConfirming, isFocusing } = this.props;
        if (isConfirming) return 'Done';
        return isFocusing ? 'Working' : 'Breaking';
    }

    private renderTimer(): React.ReactNode {
        const { time, percentage, isFocusing, isConfirming } = this.props;
        // The disc inside the ring is the state indicator: red while focusing,
        // deep navy while resting. Confirmation keeps the color of the session
        // that just finished -- there is no dedicated "done" color.
        const stateColor = isFocusing ? '#e84545' : '#2b2e4a';
        return (
            <svg className="timer-svg" viewBox="0 0 100 100" width="30" height="30">
                {/* Native SVG <title>: the same browser tooltip mechanism the
                    buttons in this row get from their title attributes. */}
                <title>{this.getTimerStateLabel()}</title>
                <circle cx="50" cy="50" r="36" fill={stateColor} />
                {Array(18)
                    .fill(0)
                    .map((_, i) => (
                        <g
                            key={i}
                            transform={`translate(50 50) rotate(${20 * i}) translate(-50 -50)`}
                        >
                            <Line
                                anime={isConfirming}
                                y1="0"
                                y2="12"
                                x1="50"
                                x2="50"
                                style={{
                                    stroke: isConfirming
                                        ? 'rgb(99, 99, 99)'
                                        : (i / 18) * 100 < percentage
                                        ? 'rgb(200, 200, 200)'
                                        : 'rgb(99,99,99)',
                                    strokeWidth: 12,
                                    animationDelay: i * (800 / 18) + 'ms',
                                }}
                            />
                        </g>
                    ))}
                <text x="50" y="64" textAnchor="middle" fontSize="40" style={{ fill: '#fff' }}>
                    {isConfirming ? (isFocusing ? '🍅' : '') : time}
                </text>
            </svg>
        );
    }

    render() {
        const { style, task } = this.props;
        return (
            <StyledLogger style={style}>
                <div className="task-row">
                    <div className="task" title={task || undefined}>
                        {task || 'No Focusing Project'}
                    </div>
                </div>
                {this.getControlRow()}
            </StyledLogger>
        );
    }
}
