import * as React from 'react';
import { Col, Row } from 'antd';
import { PomodoroRecord } from '../../monitor/type';
import styled, { keyframes } from 'styled-components';
import { to2digits } from '../../utils';
import { uid } from '../../../utils/uid';
import { Hint } from '../../../components/common/Hint/Hint';

const SvgDot = styled.svg`
    transition: transform 0.1s cubic-bezier(0.17, 0.67, 0.96, 0.59);
    &:hover {
        transform: scale(1.2);
    }
`;

const Div = styled.div``;

const CompactDots = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    font-size: 0.8em;
    line-height: 1;
`;

const NormalDots = styled.div`
    display: flex;
    justify-content: center;
    font-size: 1em;
`;

const CompactDotRow = styled.div`
    display: flex;
    justify-content: center;
    max-width: 100%;
`;

const scale = keyframes`
  0% {
    transform: scale(1.1);
    opacity: 1;
  }
  
  30% {
    transform: scale(1.4);
    opacity: 0.7;
  }
  
  40% {
    transform: scale(1.6);
    opacity: 0.4;
  }
  
  50% {
    transform: scale(1.4);
    opacity: 0.7;
  }
  
  60% {
    transform: scale(1.6);
    opacity: 0.4;
  }
  
  65% {
    transform: scale(1.4);
    opacity: 0.7;
  }
  
  100% {
    transform: scale(1.1);
    opacity: 1;
  }

`;

const AnimeSvgDot = styled(SvgDot)`
    animation: ${scale} 1s linear infinite;
`;

/** How dark a running dot is while the marquee highlight is elsewhere. */
const MARQUEE_IDLE_OPACITY = 0.45;

/** Time the highlight spends on one dot before moving to the next. */
const MARQUEE_STEP_MS = 1000;

/**
 * Keyframes are cached per dot count: the lit slice is one step of an
 * n-step cycle (`100 / count` percent), so each count needs its own
 * @keyframes. Rendering happens once a second while the timer runs, and a
 * fresh keyframes object per render would keep appending style rules.
 */
const marqueeFramesCache = new Map<number, ReturnType<typeof keyframes>>();

function marqueeFrames(count: number) {
    const cached = marqueeFramesCache.get(count);
    if (cached) return cached;
    const lit = 100 / count;
    const frames = keyframes`
        0%, ${lit}% {
            opacity: 1;
        }
        ${lit}%, 100% {
            opacity: ${MARQUEE_IDLE_OPACITY};
        }
    `;
    marqueeFramesCache.set(count, frames);
    return frames;
}

/**
 * LED-style chase: the dots stay put and one dot lights at a time, handing
 * the highlight to its right-hand neighbour every `MARQUEE_STEP_MS`. The
 * cycle length is the dot count, so the phases stay exactly one step apart;
 * `step-end` makes the hand-off instant instead of fading two dots at once.
 */
const MarqueeDot = styled(SvgDot)<{ $count: number; $index: number }>`
    opacity: ${MARQUEE_IDLE_OPACITY};
    animation: ${({ $count }) => marqueeFrames($count)}
        ${({ $count }) => $count * MARQUEE_STEP_MS}ms step-end infinite;
    animation-delay: ${({ $index }) => $index * MARQUEE_STEP_MS}ms;
    @media (prefers-reduced-motion: reduce) {
        animation: none;
        opacity: 1;
    }
`;

interface Props {
    pomodoros: PomodoroRecord[];
    color?: string;
    showNum?: boolean;
    animation?: boolean;
    newPomodoro?: PomodoroRecord;
    chooseRecord?: (record: PomodoroRecord) => void;
    inline?: boolean;
    compact?: boolean;
    /** Lifts every dot's hint above a full-window layer (the session mask). */
    hintZIndex?: number;
}

interface State {
    transform: { x: number; y: number }[];
}

function getTime(date: number) {
    const d = new Date(date);
    return `${to2digits(d.getHours())}:${to2digits(d.getMinutes())}`;
}

export class PomodoroNumView extends React.PureComponent<Props> {
    state: State = { transform: [] };
    iFrame: number = 0;
    key: string;

    constructor(props: Props) {
        super(props);
        this.key = uid();
    }

    createDot = (
        v: PomodoroRecord,
        index: number,
        isNew: boolean = false,
        isRunning: boolean = false
    ) => {
        // Same pomodoro red as the pomodoro emoji.
        const { color = '#f03a17', animation = false } = this.props;
        const { transform } = this.state;
        const n = this.props.pomodoros.length;
        // The freshly added dot keeps its own spawn pulse; the chase needs at
        // least two settled dots so there is a neighbour to hand off to.
        const marquee = !isNew && isRunning && n > 1;
        const Svg: React.ComponentType<any> = marquee ? MarqueeDot : isNew ? AnimeSvgDot : SvgDot;
        const chooseThis = this.props.chooseRecord ? () => this.props.chooseRecord!(v) : undefined;
        const label =
            (isNew ? '[New]' : getTime(v.startTime)) +
            (v.efficiency != null ? ` Efficiency: ${Math.round(v.efficiency * 100)}%` : '');
        return (
            <Hint
                key={v._id + (isNew ? 'new' : '')}
                kind="live"
                label={label}
                zIndex={this.props.hintZIndex}
            >
                <Svg
                    $count={n}
                    $index={index}
                    width="1em"
                    height="1em"
                    fill="currentColor"
                    focusable="false"
                    role="img"
                    aria-label={label}
                    viewBox="0 0 100 100"
                    style={{
                        margin: '0 0.1rem',
                        transition: 'transform 0.2s',
                        transitionTimingFunction: 'ease',
                        cursor: 'pointer',
                        transform:
                            animation && transform[index]
                                ? `translate(${transform[index].x}px, ${transform[index].y}px)`
                                : undefined,
                    }}
                >
                    <defs>
                        <circle
                            r={v.efficiency != null ? (1 - v.efficiency) * 48 : 0}
                            cx={50}
                            cy={50}
                            id={`dmusk${this.key + v._id}`}
                        />
                    </defs>
                    <mask id={`musk${this.key + v._id}`}>
                        <rect id="bg" x="0" y="0" width="100%" height="100%" fill="white" />
                        <use xlinkHref={`#dmusk${this.key + v._id}`} fill="Black" />
                    </mask>
                    <circle
                        r={50}
                        cx={50}
                        cy={50}
                        color={color}
                        mask={`url(#musk${this.key + v._id})`}
                        onClick={chooseThis}
                    />
                </Svg>
            </Hint>
        );
    };

    render() {
        const {
            showNum = true,
            pomodoros,
            newPomodoro,
            inline = false,
            animation = false,
            compact = false,
        } = this.props;
        const dots = pomodoros.map((v, index) => this.createDot(v, index, false, animation));
        if (newPomodoro != null) {
            dots.push(this.createDot(newPomodoro, dots.length, true));
        }

        if (showNum) {
            return (
                <Row style={{ padding: 12 }}>
                    <Col span={4} style={{ lineHeight: '1em' }}>
                        <h4>{pomodoros.length}</h4>
                    </Col>
                    <Col span={20} style={{ color: 'red' }}>
                        {dots}
                    </Col>
                </Row>
            );
        }

        if (inline) {
            return <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>{dots}</div>;
        }
        const compactRows = compact
            ? Array.from({ length: Math.ceil(dots.length / 24) }, (_, rowIndex) => (
                  <CompactDotRow key={rowIndex}>
                      {dots.slice(rowIndex * 24, rowIndex * 24 + 24)}
                  </CompactDotRow>
              ))
            : undefined;
        return (
            <Div
                style={{
                    padding: compact ? 4 : 12,
                    display: 'flex',
                    justifyContent: 'center',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                }}
            >
                {compact ? (
                    <CompactDots>{compactRows}</CompactDots>
                ) : (
                    <NormalDots>{dots}</NormalDots>
                )}
            </Div>
        );
    }
}
