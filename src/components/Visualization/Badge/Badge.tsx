import React from 'react';
import { formatTime } from '../../../renderer/utils';
import { uid } from '../../../utils/uid';
import styled from 'styled-components';
import { useThemeTokens } from '../../../renderer/theme/useThemeTokens';

const AnimeSvg = styled.svg`
    transition: transform 0.25s;
    user-select: none;
    cursor: default;
    font-weight: 600;
    /* The clip paths slide between the spent/left halves while the pointer
       moves over the badge. They used to carry a 0.6s transition-all, which
       made every crossing re-clip (and repaint) the badge for ~36 frames.
       Clip geometry is a paint property, so it snaps now: the detail still
       follows the pointer, but a sweep costs one paint instead of an
       animation. */
    .label {
        font-weight: 700;
    }
`;

export interface Props {
    type: string;
    color?: string;
    value: string;
    title?: string;
}

export const Badge = (props: Props) => {
    const { color = '#32d31f', type, value, title } = props;
    const textSize = Math.floor(props.type.length * 6.5 + 10);
    const timeSize = Math.floor(value.length * 6.5 + 10);
    const idA = `${type.length},${value.length}a`;
    const idB = `${type.length},${value.length}b`;
    return (
        <svg width={textSize + timeSize} height="20" style={{ margin: '1px 4px 1px 4px' }}>
            <title>{title}</title>
            <linearGradient id={idB} x2="0" y2="100%">
                <stop offset="0" stopColor="#bbb" stopOpacity=".1" />
                <stop offset="1" stopOpacity=".1" />
            </linearGradient>
            <clipPath id={idA}>
                <rect width={textSize + timeSize} height="20" rx="3" fill="#fff" />
            </clipPath>
            <g clipPath={`url(#${idA})`}>
                <path fill="#555" d={`M0 0h${textSize}v20H0z`} />
                <path fill={color} d={`M${textSize} 0h${timeSize}v20H${textSize}z`} />
                <path fill={`url(#${idB})`} d={`M0 0h${textSize + timeSize}v20H0z`} />
            </g>
            <g
                fill="#fff"
                textAnchor="middle"
                fontFamily="DejaVu Sans,Verdana,Geneva,sans-serif"
                fontSize="110"
            >
                {/* tslint:disable-next-line:max-line-length */}
                <text
                    x={(textSize / 2) * 10}
                    y="150"
                    fill="#010101"
                    fillOpacity=".3"
                    transform="scale(.1)"
                    textLength={textSize * 10 - 100}
                >
                    {type}
                </text>
                <text
                    x={(textSize / 2) * 10}
                    y="140"
                    transform="scale(.1)"
                    textLength={textSize * 10 - 100}
                >
                    {type}
                </text>
                {/* tslint:disable-next-line:max-line-length */}
                <text
                    x={10 * textSize + timeSize * 5}
                    y="150"
                    fill="#010101"
                    fillOpacity=".3"
                    transform="scale(.1)"
                    textLength={timeSize * 10 - 100}
                >
                    {value}
                </text>
                <text
                    x={textSize * 10 + timeSize * 5}
                    y="140"
                    transform="scale(.1)"
                    textLength={timeSize * 10 - 100}
                >
                    {value}
                </text>
            </g>
        </svg>
    );
};

interface TimeBadgeProps {
    spentTime?: number;
    leftTime?: number;
    collapsed?: boolean;
}

/** Pointer dwell before the spent/left detail becomes interactive. */
export const TIME_BADGE_HOVER_DELAY_MS = 200;

type ClipState = 'default' | 'spent' | 'left';

export const TimeBadge = React.memo((props: TimeBadgeProps) => {
    const { collapsed = false } = props;
    const { tokens, isDark } = useThemeTokens();
    const [clipState, setClipState] = React.useState<ClipState>('default');
    const id = React.useMemo(() => uid(), []);
    const id1 = id + '1';
    let exceeded = false;
    let { spentTime = 0, leftTime = 0 } = props;
    if (leftTime < 0) {
        leftTime = -leftTime;
        exceeded = true;
    }
    if (spentTime < 0) {
        spentTime = 0;
    }

    const sSpentTime = formatTime(spentTime);
    const sEstimatedTime = formatTime(leftTime);
    const sum = spentTime + leftTime;
    const totalWidth = 168;
    const spentWidth = sum ? ((totalWidth - 100) / sum) * spentTime + 50 : 90;
    const estimatedWidth = totalWidth - spentWidth;

    // The badge is hovered constantly while a card is crossed, so the detail
    // interaction waits for a dwell (like the pin and the list bar). The badge
    // is also one of several TimeBadges on screen (the Done list keeps its
    // cards mounted), so avoid doing work on every mouse move:
    //  - the left edge is measured once on enter instead of via
    //    getBoundingClientRect() on every move (which can force layout);
    //  - moves are ignored until the dwell elapses, so a sweep never flips the
    //    clip paths or re-renders the badge.
    const clipStateRef = React.useRef<ClipState>('default');
    const interactiveRef = React.useRef(false);
    const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const leaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const badgeLeftRef = React.useRef<number | null>(null);
    const lastClientXRef = React.useRef<number | null>(null);

    const applyClientX = (clientX: number) => {
        const left = badgeLeftRef.current;
        if (left === null) {
            return;
        }

        const offset = clientX - left;
        let next: ClipState = 'default';
        if (offset < totalWidth / 4) {
            next = 'spent';
        } else if (offset > (totalWidth / 4) * 3) {
            next = 'left';
        }
        if (next === clipStateRef.current) {
            return;
        }

        clipStateRef.current = next;
        setClipState(next);
    };

    const onEnter = (event: React.MouseEvent<SVGSVGElement>) => {
        if (collapsed) {
            return;
        }
        if (leaveTimerRef.current !== null) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }

        badgeLeftRef.current = event.currentTarget.getBoundingClientRect().left;
        lastClientXRef.current = event.clientX;
        if (interactiveRef.current || hoverTimerRef.current !== null) {
            return;
        }

        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null;
            interactiveRef.current = true;
            // The pointer may already have stopped over one of the halves;
            // apply the stored position instead of waiting for the next move.
            const clientX = lastClientXRef.current;
            if (clientX !== null) {
                applyClientX(clientX);
            }
        }, TIME_BADGE_HOVER_DELAY_MS);
    };

    const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
        if (collapsed) {
            return;
        }
        lastClientXRef.current = event.clientX;
        if (interactiveRef.current) {
            applyClientX(event.clientX);
        }
    };

    const onLeave = () => {
        if (hoverTimerRef.current !== null) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        interactiveRef.current = false;
        badgeLeftRef.current = null;
        lastClientXRef.current = null;

        if (leaveTimerRef.current !== null) {
            clearTimeout(leaveTimerRef.current);
        }
        // Short grace period, as before: briefly crossing the badge edge must
        // not flash "default" before the pointer comes back.
        leaveTimerRef.current = setTimeout(() => {
            leaveTimerRef.current = null;
            if (clipStateRef.current === 'default') {
                return;
            }
            clipStateRef.current = 'default';
            setClipState('default');
        }, 110);
    };

    React.useEffect(
        () => () => {
            if (hoverTimerRef.current !== null) {
                clearTimeout(hoverTimerRef.current);
            }
            if (leaveTimerRef.current !== null) {
                clearTimeout(leaveTimerRef.current);
            }
        },
        []
    );
    let state = clipState;
    if (estimatedWidth < 53) {
        state = 'spent';
    } else if (spentWidth < 53) {
        state = 'left';
    }

    let transform = `translate(0 0)`;
    switch (state) {
        case 'spent':
            transform = `translate(${totalWidth} 0)`;
            break;
        case 'left':
            transform = `translate(${-totalWidth} 0)`;
            break;
    }

    if (collapsed) {
        return (
            <AnimeSvg
                width={totalWidth}
                height="20"
                style={{ margin: '0 0 2px 6px', fontSize: 12 }}
            >
                <g clipPath={`url(#${id1})`}>
                    <text
                        x={0}
                        y={10}
                        textLength={sSpentTime.length * 6.2}
                        textAnchor={'start'}
                        alignmentBaseline={'central'}
                        fill={tokens.text}
                    >
                        {sSpentTime}
                    </text>
                </g>
            </AnimeSvg>
        );
    }

    return (
        <AnimeSvg
            width={totalWidth}
            height="20"
            style={{ margin: '0 0 2px 6px', fontSize: 12 }}
            onMouseEnter={onEnter}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
        >
            <defs>
                <clipPath id={id}>
                    <path
                        d={`M ${spentWidth} -10 L ${spentWidth} 30 L ${totalWidth * 2} 30 L ${
                            totalWidth * 2
                        } -10 Z`}
                        fill={'white'}
                        transform={transform}
                    />
                </clipPath>
                <clipPath id={id1}>
                    <path
                        d={`M -${totalWidth} -10 H ${spentWidth} V 40 L ${-totalWidth} 30 Z`}
                        fill={'white'}
                        transform={transform}
                    />
                </clipPath>
            </defs>

            <g clipPath={`url(#${id1})`}>
                <rect
                    height={20}
                    width={totalWidth - 50}
                    x={50}
                    rx={3}
                    fill={isDark ? '#8a6549' : '#b37e5b'}
                />
                <text
                    x={4}
                    y={10}
                    textLength={sSpentTime.length * 6.2}
                    textAnchor={'start'}
                    alignmentBaseline={'central'}
                    fill={tokens.text}
                >
                    {sSpentTime}
                    <title>Spent Time</title>
                </text>

                <text
                    className={'label'}
                    x={totalWidth - 4}
                    y={10}
                    textLength={38}
                    textAnchor={'end'}
                    alignmentBaseline={'central'}
                    fill={'white'}
                >
                    SPENT
                </text>
            </g>

            <g clipPath={`url(#${id})`}>
                <rect
                    height={20}
                    width={totalWidth - 50}
                    x={0}
                    rx={3}
                    fill={exceeded ? '#740606' : isDark ? '#4a4a4a' : '#ddd'}
                />
                <text
                    className={'label'}
                    x={4}
                    y={10}
                    textLength={30 + (exceeded ? 8 : 0)}
                    textAnchor={'start'}
                    alignmentBaseline={'central'}
                    fill={'white'}
                >
                    {exceeded ? 'EXTRA' : 'LEFT'}
                </text>
                <text
                    x={spentWidth + estimatedWidth - 4}
                    y={10}
                    textLength={sEstimatedTime.length * 6.2}
                    textAnchor={'end'}
                    alignmentBaseline={'central'}
                    fill={tokens.text}
                >
                    {sEstimatedTime}
                    <title>{exceeded ? 'Extra Time' : 'Left Time'}</title>
                </text>
            </g>
        </AnimeSvg>
    );
});
