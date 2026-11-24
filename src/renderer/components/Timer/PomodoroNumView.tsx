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

/**
 * LED-style chase. Which dot is lit comes from the countdown tick (see the
 * `tick` prop) instead of a CSS animation: a CSS animation starts whenever
 * the dot mounts, so it drifts out of phase with the second the page renders,
 * and nothing on the CSS side can see a pause or a resume.
 */
const ChaseDot = styled(SvgDot)<{ $active: boolean }>`
    opacity: ${({ $active }) => ($active ? 1 : MARQUEE_IDLE_OPACITY)};
`;

interface Props {
    pomodoros: PomodoroRecord[];
    color?: string;
    showNum?: boolean;
    animation?: boolean;
    /**
     * Whole seconds left in the running session. When given, the chase steps
     * on this value, so the highlight moves in the same render as the
     * countdown text instead of on a CSS clock of its own.
     */
    tick?: number;
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
        const { color = '#f03a17', animation = false, tick } = this.props;
        const { transform } = this.state;
        const n = this.props.pomodoros.length;
        // The freshly added dot keeps its own spawn pulse; the chase needs at
        // least two settled dots so there is a neighbour to hand off to.
        const marquee = !isNew && isRunning && n > 1 && tick !== undefined;
        // `tick` counts down, so negate it to make the highlight travel right.
        const activeIndex = marquee && tick !== undefined ? ((-tick % n) + n) % n : -1;
        const Svg: React.ComponentType<any> = marquee ? ChaseDot : isNew ? AnimeSvgDot : SvgDot;
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
                    $active={activeIndex === index}
                    width="1em"
                    height="1em"
                    fill="currentColor"
                    focusable="false"
                    role="img"
                    aria-label={label}
                    viewBox="0 0 100 100"
                    style={{
                        margin: '0 0.1rem',
                        transition: 'transform 0.2s, opacity 0.15s',
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
