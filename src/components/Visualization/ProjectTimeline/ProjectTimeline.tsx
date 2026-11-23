import * as React from 'react';
import styled, { css } from 'styled-components';
import { PomodoroRecord } from '../../../renderer/monitor/type';
import { to2digits } from '../../../renderer/utils';
import { useI18n } from '../../../renderer/i18n';
import type { TranslateFn } from '../../../shared/i18n';
import { Hint } from '../../common/Hint/Hint';
import { ProjectColorSource, useProjectColors } from '../projectColors';

/** The axis always covers the whole day; it never zooms in on what happened. */
export const HOURS_IN_DAY = 24;
/**
 * Smallest gap a time label may leave to its neighbour. A label is about 30px
 * wide at 11px, so anything below ~60px reads as one run of digits.
 */
export const MIN_LABEL_GAP = 60;
/** Candidate label intervals, all of which divide 24 evenly. */
const LABEL_STEPS = [1, 2, 3, 4, 6] as const;

/**
 * Vertical layout, top to bottom: the block row, a gap, the tick band, the axis,
 * then the time labels.
 *
 * The ticks sit on the plot side of the axis on purpose: their 4px band then
 * belongs to the period area's height instead of taking a band of its own under
 * the axis, where it would only make the area shorter. Labels stay outside,
 * under the axis, so the two never share a band.
 */
const BAR_HEIGHT = 12;
const BAR_TOP = 0;
/** Gap between the block row and the tick band, so ticks never touch a block. */
const BAR_TICK_GAP = 2;
const MAJOR_TICK_HEIGHT = 4;
const MINOR_TICK_HEIGHT = 2;
const AXIS_TOP = BAR_TOP + BAR_HEIGHT + BAR_TICK_GAP + MAJOR_TICK_HEIGHT;
const AXIS_HEIGHT = 2;
const AXIS_BOTTOM = AXIS_TOP + AXIS_HEIGHT;
const LABEL_GAP = 4;
const LABEL_LINE_HEIGHT = 14;
const LABEL_TOP = AXIS_BOTTOM + LABEL_GAP;
const CHART_HEIGHT = LABEL_TOP + LABEL_LINE_HEIGHT;
/** Arrowhead at the right end, drawn just outside the container. */
const ARROW_WIDTH = 4;
const ARROW_HALF_HEIGHT = 2;
/**
 * How far the click target reaches above and below the visible bar. A 25 minute
 * session is 12–17px wide, so this padding is what makes it a usable target.
 * It is vertical only: horizontally the button is the block itself, so a gap
 * between two sessions stays inert instead of answering for a neighbour.
 */
const HIT_PADDING = 5;

export interface TimelineSegment {
    record: PomodoroRecord;
    /** Offsets from the start of the day, in hours: 0…24. */
    startHour: number;
    endHour: number;
}

export function startOfDay(time: number): number {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Projects each record onto the day it started in.
 *
 * The right edge is `startTime + spentTimeInHour`: sessions carry no end time,
 * and the nominal duration is what the treemap and the counters report too. A
 * pomodoro that was paused therefore looks shorter than the wall-clock span it
 * occupied — accepted, see the spec.
 *
 * `endHour` keeps the real end even past 24, so the label of a session that
 * runs into the next day can still say how long it was and when it ended.
 * Drawing clips it to the axis instead (see the geometry in the component).
 */
export function buildSegments(records: PomodoroRecord[]): TimelineSegment[] {
    if (records.length === 0) {
        return [];
    }

    const dayStart = startOfDay(records[0].startTime);
    const segments: TimelineSegment[] = [];
    for (const record of records) {
        const hours = record.spentTimeInHour;
        if (!(hours > 0)) {
            continue;
        }

        const startHour = (record.startTime - dayStart) / 3600000;
        // A record that started before the day (it belongs to another day's
        // query) has no place on this axis.
        if (startHour >= HOURS_IN_DAY) {
            continue;
        }

        const endHour = startHour + hours;
        if (endHour <= 0) {
            continue;
        }

        segments.push({
            record,
            startHour: Math.max(startHour, 0),
            endHour,
        });
    }

    segments.sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour);
    return segments;
}

/**
 * Label interval in hours for a given plot width. Without a measurement the
 * 720–1000px case is assumed, which is what both call sites sit at.
 */
export function labelStepFor(width: number): number {
    if (!(width > 0)) {
        return 2;
    }

    const hourWidth = width / HOURS_IN_DAY;
    for (const step of LABEL_STEPS) {
        if (step * hourWidth >= MIN_LABEL_GAP) {
            return step;
        }
    }

    return LABEL_STEPS[LABEL_STEPS.length - 1];
}

/** `14:05` — clocks on the axis and in the labels share one formatter. */
/**
 * A clock time from an hour offset, rounded to the minute.
 *
 * Exactly 24:00 stays `24:00` — that is the end of the axis. Anything past it
 * belongs to the next day, so a session ending at 24.25 reads `00:15`, matching
 * the clock the user actually saw rather than an impossible `24:15`.
 */
export function formatClock(hour: number): string {
    const totalMinutes = Math.round(hour * 60);
    if (totalMinutes > HOURS_IN_DAY * 60) {
        const nextDay = totalMinutes % (HOURS_IN_DAY * 60);
        return `${to2digits(Math.floor(nextDay / 60))}:${to2digits(nextDay % 60)}`;
    }

    const hours = totalMinutes === HOURS_IN_DAY * 60 ? HOURS_IN_DAY : Math.floor(totalMinutes / 60);
    return `${to2digits(hours)}:${to2digits(totalMinutes % 60)}`;
}

function formatHourLabel(hour: number): string {
    return `${to2digits(hour)}:00`;
}

/**
 * Name and palette key of one block. A deleted board and an unassigned session
 * both fall back to the neutral color, but they read differently: the former
 * still has a project id, it just cannot be resolved any more.
 */
export function projectOf(
    record: PomodoroRecord,
    boards: ProjectColorSource | undefined,
    translate: TranslateFn
): { projectName: string | undefined; label: string } {
    const board = record.boardId === undefined ? undefined : boards?.[record.boardId];
    if (board !== undefined) {
        return { projectName: board.name, label: board.name };
    }

    return {
        projectName: undefined,
        label:
            record.boardId === undefined
                ? translate('history.sessionEditor.noProject')
                : translate('history.sessionEditor.unknownProject'),
    };
}

const Chart = styled.div`
    position: relative;
    width: 100%;
    height: ${CHART_HEIGHT}px;
    margin: 6px 0 10px;
`;

const Label = styled.span<{ $anchor: 'start' | 'middle' | 'end' }>`
    position: absolute;
    top: ${LABEL_TOP}px;
    font-size: 11px;
    line-height: ${LABEL_LINE_HEIGHT}px;
    color: var(--pl-text-secondary);
    white-space: nowrap;
    transform: translateX(
        ${(props) => (props.$anchor === 'start' ? '0' : props.$anchor === 'end' ? '-100%' : '-50%')}
    );
`;

/**
 * The axis, its ticks and the arrow are painted above the plot (see the render
 * order below), so they need `pointer-events: none`: otherwise the 1px tick
 * under the cursor swallows the hover that a block or a bucket column should
 * answer, and the tooltip blinks as the pointer crosses each hour.
 */
const Axis = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    top: ${AXIS_TOP}px;
    height: ${AXIS_HEIGHT}px;
    background: var(--pl-text-tertiary);
    pointer-events: none;
`;

const MajorTick = styled.div`
    position: absolute;
    top: ${AXIS_TOP - MAJOR_TICK_HEIGHT}px;
    width: 1px;
    height: ${MAJOR_TICK_HEIGHT}px;
    background: var(--pl-text-tertiary);
    pointer-events: none;
`;

const MinorTick = styled.div`
    position: absolute;
    top: ${AXIS_TOP - MINOR_TICK_HEIGHT}px;
    width: 1px;
    height: ${MINOR_TICK_HEIGHT}px;
    background: var(--pl-text-tertiary);
    pointer-events: none;
`;

const AxisArrow = styled.div`
    position: absolute;
    top: ${AXIS_TOP + AXIS_HEIGHT / 2 - ARROW_HALF_HEIGHT}px;
    right: ${-ARROW_WIDTH}px;
    width: 0;
    height: 0;
    border-left: ${ARROW_WIDTH}px solid var(--pl-text-tertiary);
    border-top: ${ARROW_HALF_HEIGHT}px solid transparent;
    border-bottom: ${ARROW_HALF_HEIGHT}px solid transparent;
    pointer-events: none;
`;

const NowMark = styled.div`
    position: absolute;
    top: 0;
    width: 1px;
    height: ${AXIS_BOTTOM}px;
    background: var(--pl-primary);
    pointer-events: none;
`;

const blockBase = css`
    position: absolute;
    top: ${BAR_TOP - HIT_PADDING}px;
    height: ${BAR_HEIGHT + HIT_PADDING * 2}px;
    padding: 0;
    margin: 0;
    border: 0;
    background: none;
    overflow: hidden;
    border-radius: 2px;
`;

/**
 * The block is a real button so it inherits Enter/Space, focus order and the
 * global focus ring (`data-pressable`). The pale end of the treemap palette
 * needs the hairline ring to stay visible against the page background.
 */
const BlockButton = styled.button`
    ${blockBase}
    cursor: pointer;

    &:hover > span,
    &:focus-visible > span {
        box-shadow: inset 0 0 0 1px var(--pl-primary);
    }
`;

const BlockBox = styled.div`
    ${blockBase}
`;

const Bar = styled.span`
    position: absolute;
    top: ${HIT_PADDING}px;
    left: 0;
    right: 0;
    height: ${BAR_HEIGHT}px;
    border-radius: 2px;
    /* The day palette ends in near-white pastels (#ffffc2), which vanish on the
       page background. A hairline in the tertiary text color gives every block
       an edge while staying lighter than the block's own fill. */
    box-shadow: inset 0 0 0 1px var(--pl-text-tertiary);
`;

/** The area chart sits on the axis, so it spans the full plot height. */
const Plot = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: ${AXIS_TOP}px;
`;

/**
 * Invisible column over one bucket, carrying its hint. Kept as HTML rather than
 * an SVG `<rect>` because `Hint` needs an element it can own and clone onto.
 */
const BucketHit = styled.div`
    position: absolute;
    top: 0;
    height: 100%;
`;

/**
 * Step outline of the area chart in a `0…buckets` by `0…100` viewBox.
 *
 * Each bucket stays a flat column: a busy half hour is a plateau of its own
 * width, not a smooth bump bleeding into the quiet hours around it.
 *
 * Read by eye only: the output is an SVG `d` string, and jsdom implements no
 * SVG geometry, so a test could only pin the exact command sequence — which
 * an equivalent rewrite of this function would break without changing a pixel.
 */
export function histogramAreaPath(values: number[], peak: number): string {
    const top = values.map((value) => 100 - (value / peak) * 100);
    let path = `M 0 ${top[0].toFixed(2)}`;
    for (let index = 1; index < top.length; index += 1) {
        path += ` H ${index} V ${top[index].toFixed(2)}`;
    }

    return `${path} H ${values.length}`;
}

export interface ProjectTimelineProps {
    /** Day mode: the sessions of the day being described. */
    records: PomodoroRecord[];
    /**
     * Period mode: focus hours per equal time-of-day bucket across the whole
     * filtered range (see `getTimeOfDayHistogram`). Takes precedence over
     * `records` and is drawn as a filled area instead of blocks.
     */
    timeOfDay?: number[];
    /** Used for project names and colors; omit to render everything neutral. */
    boards?: ProjectColorSource;
    /** Clicking a block opens the same view as clicking a pomodoro dot. */
    onChooseRecord?: (record: PomodoroRecord) => void;
}

/**
 * A single 24-hour lane under the calendar. It describes whatever the charts
 * below describe: one day when a date is picked (blocks per session, coloured by
 * project), or the whole filtered range otherwise (an area chart of the hours
 * worked at each time of day).
 *
 * Everything is positioned in percentages, so a resize needs no re-layout — only
 * the label interval depends on the width. Both modes use the same box, and an
 * empty one keeps its height and draws nothing, so the charts below never move.
 */
export const ProjectTimeline: React.FC<ProjectTimelineProps> = (props: ProjectTimelineProps) => {
    const { records, timeOfDay, boards, onChooseRecord } = props;
    const { t } = useI18n();
    const colorOf = useProjectColors(boards);
    const container = React.useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = React.useState(0);

    const segments = React.useMemo(() => buildSegments(records), [records]);

    React.useLayoutEffect(() => {
        const element = container.current;
        if (element == null) {
            return undefined;
        }

        const measure = () => setWidth(element.clientWidth);
        measure();
        if (typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const isPeriod = timeOfDay !== undefined;
    const periodPeak = isPeriod ? Math.max(0, ...timeOfDay) : 0;

    // An empty lane holds the space without claiming to be a chart: no axis, no
    // label and nothing for assistive tech to read over the date above it.
    if (isPeriod ? periodPeak <= 0 : segments.length === 0) {
        return <Chart ref={container} aria-hidden="true" />;
    }

    const step = labelStepFor(width);

    const labels: React.ReactNode[] = [];
    for (let hour = 0; hour <= HOURS_IN_DAY; hour += step) {
        labels.push(
            <Label
                key={`label-${hour}`}
                $anchor={hour === 0 ? 'start' : hour === HOURS_IN_DAY ? 'end' : 'middle'}
                style={{ left: `${(hour / HOURS_IN_DAY) * 100}%` }}
            >
                {formatHourLabel(hour)}
            </Label>
        );
    }

    const ticks: React.ReactNode[] = [];
    for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
        // 0:00 and 24:00 are the ends of the axis and carry no tick; the
        // arrowhead past 24:00 is what closes it.
        if (hour > 0) {
            ticks.push(
                <MajorTick
                    key={`major-${hour}`}
                    style={{ left: `${(hour / HOURS_IN_DAY) * 100}%` }}
                />
            );
        }
        ticks.push(
            <MinorTick
                key={`minor-${hour}`}
                style={{ left: `${((hour + 0.5) / HOURS_IN_DAY) * 100}%` }}
            />
        );
    }

    const blocks = isPeriod
        ? []
        : segments.map((segment) => {
              const { projectName, label } = projectOf(segment.record, boards, t);
              const blockLabel = t(
                  'chart.timeline.block',
                  label,
                  formatClock(segment.startHour),
                  formatClock(segment.endHour),
                  Math.round((segment.endHour - segment.startHour) * 60)
              );
              // The button is the block: no horizontal padding, so the gaps
              // between sessions belong to no one. A session running past
              // midnight is clipped here; the label above still tells the
              // truth about where it ended.
              const visibleEndHour = Math.min(segment.endHour, HOURS_IN_DAY);
              const geometry = {
                  left: `${(segment.startHour / HOURS_IN_DAY) * 100}%`,
                  width: `${((visibleEndHour - segment.startHour) / HOURS_IN_DAY) * 100}%`,
              };
              const bar = <Bar style={{ backgroundColor: colorOf(projectName) }} />;

              return (
                  <Hint key={segment.record._id} kind="live" label={blockLabel}>
                      {onChooseRecord === undefined ? (
                          <BlockBox style={geometry}>{bar}</BlockBox>
                      ) : (
                          <BlockButton
                              type="button"
                              data-pressable
                              aria-label={blockLabel}
                              style={geometry}
                              onClick={() => onChooseRecord(segment.record)}
                          >
                              {bar}
                          </BlockButton>
                      )}
                  </Hint>
              );
          });

    const dayStart =
        !isPeriod && segments.length > 0 ? startOfDay(segments[0].record.startTime) : undefined;
    const now = Date.now();
    const nowHour =
        dayStart !== undefined && startOfDay(now) === dayStart
            ? (now - dayStart) / 3600000
            : undefined;

    let plot: React.ReactNode;
    let summary: string;
    if (isPeriod) {
        const bucketHours = HOURS_IN_DAY / timeOfDay.length;
        const totalHours = timeOfDay.reduce((sum, value) => sum + value, 0);
        const peakIndex = timeOfDay.indexOf(periodPeak);
        const outline = histogramAreaPath(timeOfDay, periodPeak);
        summary = t(
            'chart.timeline.period',
            totalHours.toFixed(1),
            `${formatClock(peakIndex * bucketHours)}–${formatClock((peakIndex + 1) * bucketHours)}`
        );
        plot = (
            <Plot>
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${timeOfDay.length} 100`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <path
                        d={`${outline} V 100 H 0 Z`}
                        style={{ fill: 'var(--pl-primary)', fillOpacity: 0.22 }}
                    />
                    <path
                        d={outline}
                        style={{ fill: 'none', stroke: 'var(--pl-primary)', strokeWidth: 1 }}
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
                {timeOfDay.map((value, index) =>
                    value > 0 ? (
                        <Hint
                            key={`bucket-${index}`}
                            kind="live"
                            label={t(
                                'chart.timeline.bucket',
                                formatClock(index * bucketHours),
                                formatClock((index + 1) * bucketHours),
                                value.toFixed(1)
                            )}
                        >
                            <BucketHit
                                style={{
                                    left: `${(index / timeOfDay.length) * 100}%`,
                                    width: `${100 / timeOfDay.length}%`,
                                }}
                            />
                        </Hint>
                    ) : null
                )}
            </Plot>
        );
    } else {
        summary = t(
            'chart.timeline.summary',
            segments.length,
            formatClock(segments[0].startHour),
            formatClock(segments[segments.length - 1].endHour)
        );
        plot = (
            <>
                {blocks}
                {nowHour === undefined ? undefined : (
                    <NowMark
                        aria-hidden="true"
                        style={{ left: `${(nowHour / HOURS_IN_DAY) * 100}%` }}
                    />
                )}
            </>
        );
    }

    return (
        <Chart
            ref={container}
            role={!isPeriod && onChooseRecord !== undefined ? 'group' : 'img'}
            aria-label={summary}
        >
            {labels}
            <Axis />
            <AxisArrow aria-hidden="true" />
            {plot}
            {/* After the plot: the ticks point into it, so they have to sit on
                top of the area (and of a block that happens to cover an hour). */}
            {ticks}
        </Chart>
    );
};
