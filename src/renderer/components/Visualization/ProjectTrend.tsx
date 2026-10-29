import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { PomodoroRecord } from '../../monitor/type';
import { workers } from '../../workers';

const Container = styled.div`
    position: relative;
    transition: background-color 1s;
    background-color: rgba(255, 255, 223, 0);
    &:hover {
        background-color: rgba(23, 43, 223, 0.1);
        h1 {
            opacity: 1;
        }
    }

    h1 {
        color: #0074e9;
        opacity: 0;
        transition: opacity 0.5s;
        text-align: center;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
`;

const NoHover = styled.div``;

interface Props {
    width?: number;
    height?: number;
    data: number[];
    hoverEffect?: boolean;
}

interface SparklineProps {
    width?: number;
    height?: number;
    data: number[];
    smooth?: boolean;
    gradient?: string[];
    strokeWidth?: number;
    strokeLinecap?: 'butt' | 'square' | 'round';
}

const DEFAULT_GRADIENT = ['#00c6ff', '#F0F', '#FF0'];
const PADDING = 8;

const buildSmoothPath = (points: { x: number; y: number }[]): string => {
    if (points.length === 0) {
        return '';
    }
    if (points.length === 1) {
        return `M ${points[0].x},${points[0].y}`;
    }

    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const point = points[i];
        const next = points[i + 1];
        // Quadratic segments meet at the midpoint of each pair, which smooths
        // the line without overshooting the data like a Catmull-Rom spline.
        path += ` Q ${point.x},${point.y} ${(point.x + next.x) / 2},${(point.y + next.y) / 2}`;
    }
    const last = points[points.length - 1];
    return `${path} L ${last.x},${last.y}`;
};

const buildLinearPath = (points: { x: number; y: number }[]): string =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');

/**
 * A dependency-free replacement for the archived `react-trend` git fork.
 *
 * The card/table sparkline only needs a normalized path and a gradient; keeping
 * the SVG local removes a codeload dependency that had no package manifest.
 * `width`/`height` are optional so callers keep the old behavior of filling the
 * parent width; the viewBox uses a fixed 300x75 coordinate space.
 */
const Sparkline: React.FC<SparklineProps> = ({
    width,
    height,
    data,
    smooth = false,
    gradient = DEFAULT_GRADIENT,
    strokeWidth = 1.5,
    strokeLinecap = 'butt',
}) => {
    const gradientId = `pl-sparkline-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (data.length < 2) {
        return null;
    }

    const viewWidth = width ?? 300;
    const viewHeight = height ?? 75;
    const svgWidth = width ?? '100%';
    const svgHeight = height ?? 30;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const points = data.map((value, index) => ({
        x: PADDING + (index * (viewWidth - PADDING * 2)) / (data.length - 1),
        y:
            max === min
                ? viewHeight - PADDING
                : viewHeight - PADDING - ((value - min) / (max - min)) * (viewHeight - PADDING * 2),
    }));
    const path = smooth ? buildSmoothPath(points) : buildLinearPath(points);

    return (
        <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            preserveAspectRatio="none"
            focusable="false"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    {gradient.map((color, index) => (
                        <stop
                            key={`${color}-${index}`}
                            offset={`${(index / Math.max(gradient.length - 1, 1)) * 100}%`}
                            stopColor={color}
                        />
                    ))}
                </linearGradient>
            </defs>
            <path
                d={path}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={strokeWidth}
                strokeLinecap={strokeLinecap}
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};

export const ProjectTrend: React.FC<Props> = (props: Props) => {
    const { hoverEffect = false } = props;
    const C = hoverEffect ? Container : NoHover;
    return (
        <C>
            {props.data.length > 0 ? (
                <>
                    {hoverEffect ? <h1>TREND</h1> : undefined}
                    <Sparkline
                        width={props.width}
                        height={props.height}
                        smooth={true}
                        data={props.data}
                        gradient={DEFAULT_GRADIENT}
                        strokeWidth={1.5}
                        strokeLinecap={'butt'}
                    />
                </>
            ) : undefined}
        </C>
    );
};

interface InputProps extends Partial<Props> {
    boardId: string;
}

/** Number of days shown by every trend sparkline; also the query range. */
export const TREND_SPAN_IN_DAYS = 30;

export function countRecordNum(
    records: Pick<PomodoroRecord, 'startTime'>[],
    spanInDay: number = TREND_SPAN_IN_DAYS
): number[] {
    const data: number[] = Array(spanInDay).fill(0);
    const now = new Date().getTime();
    for (const record of records) {
        const dayCountTillToday = (now - record.startTime) / 1000 / 3600 / 24;
        if (dayCountTillToday >= spanInDay) {
            continue;
        }

        const countIndex = Math.floor(spanInDay - dayCountTillToday);
        data[countIndex] += 1;
    }

    return data;
}

export const IdTrend: React.FC<InputProps> = (props: InputProps) => {
    const [data, setData] = useState([0, 0, 0, 0, 0]);
    const { boardId, ...restProps } = props;
    useEffect(() => {
        let cancelled = false;
        const worker = workers.dbWorkers.sessionDB;
        // The sparkline only needs one number per session (its start time).
        // The query used to return the complete session documents, so the main
        // process parsed every full `doc` (apps, screenshots, switch history,
        // ...) and cloned all of them over IPC just to throw them away here.
        // Projecting `startTime` also lets the repository read a single scalar
        // column, and the range filter uses the (board_id, start_time) index.
        const since = Date.now() - TREND_SPAN_IN_DAYS * 24 * 3600 * 1000;
        worker
            .find({ boardId, startTime: { $gte: since } }, { startTime: 1 })
            .then((values: Pick<PomodoroRecord, 'startTime'>[]) => {
                // 切换项目/图表时丢弃过期的查询结果，避免旧状态覆盖新状态
                if (cancelled) {
                    return;
                }

                const counter = countRecordNum(values);
                counter[counter.length - 1] += 0.001;
                setData(counter);
            });
        return () => {
            cancelled = true;
        };
    }, [boardId]);

    return <ProjectTrend data={data} {...restProps} />;
};
