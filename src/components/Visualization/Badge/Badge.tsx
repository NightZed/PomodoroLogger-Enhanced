import React from 'react';
import { formatTime } from '../../../renderer/utils';
import { uid } from '../../../utils/uid';
import styled from 'styled-components';
import { useThemeTokens } from '../../../renderer/theme/useThemeTokens';
import { useI18n } from '../../../renderer/i18n';

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

const AccuracySlot = styled.span`
    /* Takes whatever the two fixed-width SVGs leave over and centers the grade
       in it, so the letter sits in the middle of the empty space instead of
       hugging the card edge. */
    flex: 1 1 auto;
    display: flex;
    justify-content: center;
    align-items: center;
`;

/* Exam-paper red pen: the grade is written and then circled. The ring is a
   pseudo-element so it never takes part in layout -- the badge row stays 20px
   tall and the ring is free to sit slightly outside the text. */
const CIRCLED_GRADE_COLOR = '#e53935';

const AccuracyGrade = styled.span`
    position: relative;
    display: inline-block;
    padding: 0 6px;
    /* Matches the hour readout inside TimeBadge: same text color, size and
       weight, so the grade reads as part of the same row rather than a
       separate widget. */
    line-height: 16px;
    font-size: 12px;
    font-style: italic;
    font-weight: 600;
    color: var(--pl-text);
    white-space: nowrap;
    cursor: default;

    /* An ellipse rather than a circle: the grade is two or three characters
       wide, and a circle would have to either clip them or push the letters
       below the neighbouring hour text. Sizes stay under the 54px the row has
       left over, so a circled "SSS" never reaches the time badge. */
    &::after {
        content: '';
        position: absolute;
        inset: -3px -5px;
        border: 2px solid ${CIRCLED_GRADE_COLOR};
        border-radius: 50%;
        pointer-events: none;
    }
`;

export interface AccuracyReadoutProps {
    /** Grade letter, e.g. `A+`. */
    value: string;
    title?: string;
}

/**
 * The board overview's estimate-accuracy readout. It used to be a two-segment
 * shields-style chip (grey `accuracy` label + colored value + gloss): at 93px
 * it did not fit next to the pomodoro dot and time badge, so it wrapped onto a
 * line of its own, and its saturated fill plus English label read as a foreign
 * element inside the card. It is now a plain grade letter in the card's own
 * text color, circled in red pen like a marked exam; the tooltip is the only
 * place the label survives.
 */
export const AccuracyReadout = (props: AccuracyReadoutProps) => (
    <AccuracySlot>
        <AccuracyGrade title={props.title}>{props.value}</AccuracyGrade>
    </AccuracySlot>
);

interface TimeBadgeProps {
    spentTime?: number;
    leftTime?: number;
    collapsed?: boolean;
}

/** Which half of the badge is shown: both totals, only spent, or only left. */
export type TimeBadgeHalf = 'default' | 'spent' | 'left';

/** Pointer dwell before the spent/left detail becomes interactive. */
export const TIME_BADGE_HOVER_DELAY_MS = 200;

/** Grace after the pointer leaves, so briefly crossing the edge does not flash. */
export const TIME_BADGE_LEAVE_DELAY_MS = 110;

const TIME_BADGE_WIDTH = 168;

/**
 * The half a pointer at `offset` points at: the outer quarters reveal that
 * half's detail, the middle keeps both totals.
 */
export const halfAtOffset = (offset: number, width = TIME_BADGE_WIDTH): TimeBadgeHalf => {
    if (offset < width / 4) {
        return 'spent';
    }
    if (offset > (width / 4) * 3) {
        return 'left';
    }
    return 'default';
};

/**
 * A half is dropped only when it has no data at all. Keying this on pixel width
 * used to hide the spent half whenever the remaining estimate was long enough
 * to squeeze it below 53px -- and with it the project's actual invested time.
 * The half still has its 50px floor, and `formatTime`'s longest output (seven
 * characters, ~47px with the 4px inset) fits in it.
 */
export const resolveVisibleHalf = (
    spentTime: number,
    leftTime: number,
    hovered: TimeBadgeHalf
): TimeBadgeHalf => {
    if (spentTime === 0 && leftTime !== 0) {
        return 'left';
    }
    if (leftTime === 0 && spentTime !== 0) {
        return 'spent';
    }
    return hovered;
};

/**
 * The hover state machine: wait for a dwell before the pointer can flip the
 * detail, then follow it until the pointer leaves.
 */
export const useHoverDwell = (
    delay = TIME_BADGE_HOVER_DELAY_MS,
    grace = TIME_BADGE_LEAVE_DELAY_MS
) => {
    const [half, setHalf] = React.useState<TimeBadgeHalf>('default');
    const halfRef = React.useRef<TimeBadgeHalf>('default');
    const interactiveRef = React.useRef(false);
    const dwellTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const leaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingOffsetRef = React.useRef<number | null>(null);

    const show = (next: TimeBadgeHalf) => {
        if (next === halfRef.current) {
            return;
        }
        halfRef.current = next;
        setHalf(next);
    };

    const onEnter = (offset: number) => {
        if (leaveTimerRef.current !== null) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
        pendingOffsetRef.current = offset;
        if (interactiveRef.current || dwellTimerRef.current !== null) {
            return;
        }

        dwellTimerRef.current = setTimeout(() => {
            dwellTimerRef.current = null;
            interactiveRef.current = true;
            // The pointer may already have stopped over one of the halves;
            // apply the stored position instead of waiting for the next move.
            if (pendingOffsetRef.current !== null) {
                show(halfAtOffset(pendingOffsetRef.current));
            }
        }, delay);
    };

    const onMove = (offset: number) => {
        pendingOffsetRef.current = offset;
        if (interactiveRef.current) {
            show(halfAtOffset(offset));
        }
    };

    const onLeave = () => {
        if (dwellTimerRef.current !== null) {
            clearTimeout(dwellTimerRef.current);
            dwellTimerRef.current = null;
        }
        interactiveRef.current = false;
        pendingOffsetRef.current = null;
        if (leaveTimerRef.current !== null) {
            clearTimeout(leaveTimerRef.current);
        }
        leaveTimerRef.current = setTimeout(() => {
            leaveTimerRef.current = null;
            show('default');
        }, grace);
    };

    React.useEffect(
        () => () => {
            if (dwellTimerRef.current !== null) {
                clearTimeout(dwellTimerRef.current);
            }
            if (leaveTimerRef.current !== null) {
                clearTimeout(leaveTimerRef.current);
            }
        },
        []
    );

    return { half, onEnter, onMove, onLeave };
};

export const TimeBadge = React.memo((props: TimeBadgeProps) => {
    const { t } = useI18n();
    const { collapsed = false } = props;
    const { tokens, isDark } = useThemeTokens();
    const { half: hovered, onEnter, onMove, onLeave } = useHoverDwell();
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
    const totalWidth = TIME_BADGE_WIDTH;
    const spentWidth = sum ? ((totalWidth - 100) / sum) * spentTime + 50 : 90;
    const estimatedWidth = totalWidth - spentWidth;

    // The badge is hovered constantly while a card is crossed, and it is one
    // of several TimeBadges on screen (the Done list keeps its cards mounted).
    // Measure the left edge once per enter instead of on every move; the dwell
    // itself lives in `useHoverDwell`.
    const badgeLeftRef = React.useRef<number | null>(null);

    const handleEnter = (event: React.MouseEvent<SVGSVGElement>) => {
        if (collapsed) {
            return;
        }
        badgeLeftRef.current = event.currentTarget.getBoundingClientRect().left;
        onEnter(event.clientX - badgeLeftRef.current);
    };

    const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const left = badgeLeftRef.current;
        if (collapsed || left === null) {
            return;
        }
        onMove(event.clientX - left);
    };

    const handleLeave = () => {
        badgeLeftRef.current = null;
        onLeave();
    };

    const state = resolveVisibleHalf(spentTime, leftTime, hovered);

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
            onMouseEnter={handleEnter}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
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
                    <title>{t('chart.badge.spentTime')}</title>
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
                    {exceeded ? t('chart.badge.extra') : t('chart.badge.left')}
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
                    <title>
                        {exceeded ? t('chart.badge.extraTime') : t('chart.badge.leftTime')}
                    </title>
                </text>
            </g>
        </AnimeSvg>
    );
});
