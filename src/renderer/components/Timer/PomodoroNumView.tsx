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

interface DotProps {
    record: PomodoroRecord;
    /** The dot of the session that just finished, still waiting for a label. */
    isNew: boolean;
    /** The session is running; new dots keep their spawn pulse. */
    isRunning: boolean;
    /** The chase is on: running, at least two settled dots, a countdown tick. */
    chase: boolean;
    /** This dot carries the chase highlight right now. */
    active: boolean;
    color: string;
    /** Unique per view, so the SVG mask ids of two views cannot collide. */
    idPrefix: string;
    transform?: { x: number; y: number };
    chooseRecord?: (record: PomodoroRecord) => void;
    hintZIndex?: number;
}

/**
 * One dot. Memoized because the timer re-renders on every countdown tick:
 * only the two dots whose `active` flag flips need to re-render, the rest
 * would otherwise rebuild their antd Tooltip once a second for nothing.
 * Every prop above is a scalar or a stable reference, so the comparison holds.
 */
const Dot = React.memo(function Dot(props: DotProps) {
    const {
        record: v,
        isNew,
        isRunning,
        chase,
        active,
        color,
        idPrefix,
        transform,
        chooseRecord,
        hintZIndex,
    } = props;
    const Svg: React.ComponentType<any> = chase ? ChaseDot : isNew ? AnimeSvgDot : SvgDot;
    const chooseThis = chooseRecord ? () => chooseRecord(v) : undefined;
    const label =
        (isNew ? '[New]' : getTime(v.startTime)) +
        (v.efficiency != null ? ` Efficiency: ${Math.round(v.efficiency * 100)}%` : '');
    return (
        <Hint kind="live" label={label} zIndex={hintZIndex}>
            <Svg
                $active={active}
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
                        isRunning && transform
                            ? `translate(${transform.x}px, ${transform.y}px)`
                            : undefined,
                }}
            >
                <defs>
                    <circle
                        r={v.efficiency != null ? (1 - v.efficiency) * 48 : 0}
                        cx={50}
                        cy={50}
                        id={`dmusk${idPrefix + v._id}`}
                    />
                </defs>
                <mask id={`musk${idPrefix + v._id}`}>
                    <rect id="bg" x="0" y="0" width="100%" height="100%" fill="white" />
                    <use xlinkHref={`#dmusk${idPrefix + v._id}`} fill="Black" />
                </mask>
                <circle
                    r={50}
                    cx={50}
                    cy={50}
                    color={color}
                    mask={`url(#musk${idPrefix + v._id})`}
                    onClick={chooseThis}
                />
            </Svg>
        </Hint>
    );
});

export class PomodoroNumView extends React.PureComponent<Props> {
    state: State = { transform: [] };
    iFrame: number = 0;
    key: string;

    constructor(props: Props) {
        super(props);
        this.key = uid();
    }

    render() {
        const {
            showNum = true,
            pomodoros,
            newPomodoro,
            inline = false,
            animation = false,
            compact = false,
            // Same pomodoro red as the pomodoro emoji.
            color = '#f03a17',
            tick,
            chooseRecord,
            hintZIndex,
        } = this.props;
        const { transform } = this.state;
        const n = pomodoros.length;
        // The freshly added dot keeps its own spawn pulse; the chase needs at
        // least two settled dots so there is a neighbour to hand off to.
        const chase = animation && n > 1 && tick !== undefined;
        // `tick` counts down, so negate it to make the highlight travel right.
        const activeIndex = chase && tick !== undefined ? ((-tick % n) + n) % n : -1;
        const sharedDotProps = {
            isRunning: animation,
            color,
            idPrefix: this.key,
            chooseRecord,
            hintZIndex,
        };
        const dots = pomodoros.map((v, index) => (
            <Dot
                key={v._id}
                record={v}
                isNew={false}
                chase={chase}
                active={chase && index === activeIndex}
                transform={transform[index]}
                {...sharedDotProps}
            />
        ));
        if (newPomodoro != null) {
            dots.push(
                <Dot
                    key={newPomodoro._id + 'new'}
                    record={newPomodoro}
                    isNew={true}
                    chase={false}
                    active={false}
                    {...sharedDotProps}
                />
            );
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
