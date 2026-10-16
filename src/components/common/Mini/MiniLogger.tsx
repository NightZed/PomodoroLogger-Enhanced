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
    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

/**
 * Second-hand tick positioned by wall time instead of a free-running CSS
 * loop, so it can never drift: pause freezes the prop (the tick freezes with
 * it), resume continues from it, a new session re-anchors it. The rendered
 * angle is cumulative (see `renderTimer`): each passing second adds +6deg, so
 * the hand always walks clockwise and the minute wrap is 354deg -> 360deg
 * (identical to 0deg) instead of a backward sweep. It snaps to each detent
 * instantly like a quartz second hand -- no transform transition, so the
 * compositor skips the ~10 interpolated sweep frames per tick. It stays mounted across
 * pause/resume and only flips opacity, so React never remounts the node
 * mid-session.
 */
const SecondHand = styled.g<{ hidden: boolean }>`
    transform-box: view-box;
    transform-origin: center;
    opacity: ${({ hidden }) => (hidden ? 0 : 1)};
    transition: opacity 180ms ease-out;
    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
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
    /* No surface of its own: mini mode has no title bar, so it wants the same
       page surface as the normal and compact content areas -- and that surface
       is already painted by the window background layer (see Application.tsx)
       behind this component. Painting it a second time here would stack the two
       alphas and make mini mode denser than the normal window. */
    background-color: transparent;
    display: flex;
    flex-direction: column;
    /* Frameless window: dragging anywhere except the buttons moves the strip. */
    -webkit-app-region: drag;
    /* Matches the window corner radius (Main writes --pl-window-radius); the
       fallback keeps standalone styleguidist previews rounded as well. */
    border-radius: var(--pl-window-radius, 10px);
    overflow: hidden;
    margin: 0 auto;

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

    /* Disabled (e.g. Stop while waiting for confirmation after a rest):
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
        /* Let Chromium process SVG hover metadata instead of treating the
           timer as part of the window drag region. */
        -webkit-app-region: no-drag;
    }

    /* Paused-but-alive session: the whole dial dims so running (bright +
       orbiting dot) and idle (static ring) each have their own read. The
       time text keeps full contrast via its own fill below. */
    .timer-svg.is-paused {
        opacity: 0.62;
        filter: saturate(0.55);
    }

    /* Small pause badge tucked at the lower-right of the dial. Sized in SVG
       units (viewBox 100) so it stays proportional to the 30px render: a
       dark pill behind two white bars, never covering the time text. */
    .timer-paused-badge {
        pointer-events: none;
    }
`;

interface Props {
    play: () => void;
    /**
     * Toggles run/pause -- the owner wires the same toggle handler here as on
     * its play button, so the pause control doubles as resume while paused (it
     * is the only handler that must work in both states).
     */
    pause: () => void;
    finish: () => void;
    /** Discards the current session (what the "Stop" button calls), unlike `pause`. */
    stop: () => void;
    switch: () => void;
    expand: () => void;
    confirm: () => void;
    confirmAndStartNextSession: () => void;
    extendCurrentSession: (minute: number) => void;
    time: string;
    percentage: number;
    /**
     * Whole remaining seconds of the live countdown, committed every tick by
     * `Timer.updateLeftTime` (unlike `percentage`, which is throttled to 2%
     * steps). The second hand derives a cumulative clockwise angle from it
     * (each elapsed second adds +6deg from 12 o'clock): pause freezes the
     * value (the hand holds its detent with no extra code), resume continues
     * from it, and a new session re-anchors it. `undefined` while idle or
     * confirming -- there is no hand to show then.
     */
    secondsLeft?: number;
    isRunning: boolean;
    isFocusing: boolean;
    isConfirming: boolean;
    task: string;
    style?: React.CSSProperties;
    stagedPomodoro?: PomodoroRecord;
    /**
     * Whether a session exists -- running, or paused with time left. It decides
     * between "Finish" and "Switch Mode" (see `getControlRow`).
     *
     * Never derive this from `percentage`: the owner throttles that value to 2%
     * steps (`Timer.updateLeftTime`), so it stays 0 for the first 2% of a
     * session -- up to 30s on a 25 minute focus session -- and the "Switch
     * Mode" button would stay on screen after the session had already started.
     * The owner passes `sessionState.hasSession`, the same predicate the
     * normal/compact pages and the mode-switch guard use.
     */
    hasSession: boolean;
}

export class MiniLogger extends React.Component<Props> {
    constructor(props: Props) {
        super(props);
    }

    /**
     * Cumulative second-hand angle, so the hand always walks clockwise. The
     * countdown prop (`secondsLeft`) DECREASES, and `secondsLeft % 60 * 6deg`
     * would decrease with it (counter-clockwise); worse, each minute wrap
     * 0deg -> 354deg was interpolated by the CSS transition as a full
     * clockwise sweep -- the "spin then walk backwards" bug. Instead the hand
     * starts at 12 o'clock and each elapsed second adds +6deg: the modulo-60
     * dial position is identical, but the rendered angle never goes backward.
     *
     * Reset bookkeeping: when the countdown jumps UP by more than a tick
     * (new session, mode switch, +5/+10 extension re-anchor), the cumulative
     * base restarts so the hand snaps to 12 o'clock for the new round instead
     * of spinning forward from the old total.
     */
    private handBaseSecondsLeft: number | undefined = undefined;
    private handElapsedSeconds = 0;
    private handLastSecondsLeft: number | undefined = undefined;

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
            hasSession,
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
                <Button size="small" icon="check" title="Finish" onClick={this.props.confirm} />
            </>
        ) : (
            <>
                {isRunning ? (
                    <Button size="small" icon="pause" title="Pause (F6)" onClick={pause} />
                ) : (
                    <Button size="small" icon="caret-right" title="Start (F5)" onClick={play} />
                )}
                {/* `hasSession`, not `percentage`: see its documentation -- the
                    percentage is throttled, so it cannot tell "no session" from
                    "a session that has not reached 2% yet". */}
                {hasSession ? (
                    <Button size="small" icon="check" title="Finish" onClick={this.props.finish} />
                ) : (
                    <Button
                        size="small"
                        icon="swap"
                        title="Switch Mode (Tab)"
                        onClick={this.props.switch}
                    />
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
                // always stays filled. Stopping is not allowed while waiting
                // for confirmation, but leaving mini mode still works.
                <>
                    <Button
                        size="small"
                        icon="close"
                        title="Stop"
                        onClick={this.props.stop}
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
        const { isConfirming, isFocusing, isRunning, hasSession } = this.props;
        if (isConfirming) return 'Finish';
        const phase = isFocusing ? 'Working' : 'Breaking';
        if (hasSession && !isRunning) return `${phase} - Paused`;
        if (isRunning) return `${phase} - Running`;
        return phase;
    }

    private renderTimer(): React.ReactNode {
        const { time, percentage, isFocusing, isConfirming, isRunning, hasSession, secondsLeft } =
            this.props;
        // The disc inside the ring is the state indicator: red while focusing,
        // deep navy while resting. Confirmation keeps the color of the session
        // that just finished -- there is no dedicated "finish" color.
        const stateColor = isFocusing ? '#e84545' : '#2b2e4a';
        // Four visual states, in priority order: confirming (existing fast
        // chase) > running (slow orbit dot) > paused-with-session (dimmed dial
        // + badge) > idle (unchanged static ring). Paused must require
        // hasSession: without a session the timer is idle, not paused, and the
        // owner derives hasSession from sessionState (never from the throttled
        // percentage) for exactly this kind of call.
        const isPausedWithSession = !isConfirming && hasSession && !isRunning;
        // Cumulative clockwise angle from the DECREASING countdown: the hand
        // starts each round at 12 o'clock and every elapsed second adds +6deg.
        // `secondsLeft % 60 * 6deg` would walk counter-clockwise and sweep a
        // full circle on each minute wrap (0deg -> 354deg interpolated
        // clockwise by the CSS transition) -- the reported bug.
        let handAngle: number | undefined;
        if (!isConfirming && hasSession && secondsLeft !== undefined) {
            if (
                this.handBaseSecondsLeft === undefined ||
                this.handLastSecondsLeft === undefined ||
                // New round (start / switch mode / extend re-anchor): the
                // countdown jumped UP, so restart from 12 o'clock.
                secondsLeft > this.handLastSecondsLeft + 1
            ) {
                this.handBaseSecondsLeft = secondsLeft;
                this.handElapsedSeconds = 0;
            } else if (secondsLeft < this.handLastSecondsLeft) {
                // Normal tick (possibly several seconds at once after a
                // throttled render): advance the same amount.
                this.handElapsedSeconds += this.handLastSecondsLeft - secondsLeft;
            }
            // Paused renders repeat the frozen value: neither branch moves, so
            // the hand holds its detent until resume.
            this.handLastSecondsLeft = secondsLeft;
            handAngle = this.handElapsedSeconds * 6;
        } else {
            this.handBaseSecondsLeft = undefined;
            this.handLastSecondsLeft = undefined;
            this.handElapsedSeconds = 0;
        }
        const showSecondHand = handAngle !== undefined;
        const ringDim = isPausedWithSession ? 0.45 : 1;
        return (
            <svg
                className={`timer-svg${isPausedWithSession ? ' is-paused' : ''}`}
                viewBox="0 0 100 100"
                width="30"
                height="30"
            >
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
                    {isConfirming ? (isFocusing ? '🍅' : '🍇') : time}
                </text>
                {showSecondHand && (
                    <SecondHand
                        hidden={isPausedWithSession}
                        className="timer-orbit"
                        style={{
                            // Cumulative clockwise angle (see above): never
                            // decreases, so the transition always ticks forward
                            // 6deg per second -- no wrap sweep, no backwards walk.
                            // `transform-box: view-box` keeps the origin at the
                            // dial centre in Chromium/Electron.
                            transform: `rotate(${handAngle as number}deg)`,
                        }}
                    >
                        {/* Slim tick riding the outer gap (just outside the
                            18-tick ring): slightly longer than a progress tick
                            (16 vs 12) but narrower (6 vs 12), so it reads as a
                            second hand while the progress ticks stay static and
                            readable. Hidden (opacity 0) while paused so only
                            the pause badge shows. */}
                        <rect
                            x="47"
                            y="0"
                            width="8"
                            height="12"
                            rx="3"
                            fill="rgba(255, 255, 255, 0.95)"
                        />
                    </SecondHand>
                )}
                {isPausedWithSession && (
                    <g className="timer-paused-badge">
                        {/* Lower-right pill + twin bars: offset from centre so
                            the time text stays fully visible at 30px. */}
                        <rect
                            x="58"
                            y="62"
                            width="30"
                            height="26"
                            rx="13"
                            fill="rgba(0, 0, 0, 0.72)"
                            opacity={ringDim}
                        />
                        <rect x="66" y="68" width="5" height="14" rx="2" fill="#fff" />
                        <rect x="75" y="68" width="5" height="14" rx="2" fill="#fff" />
                    </g>
                )}
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
