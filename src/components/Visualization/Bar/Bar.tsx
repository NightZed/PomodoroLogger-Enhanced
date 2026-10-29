import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Svg = styled.svg`
    .bg rect {
        opacity: 0;
        fill: rgba(200, 80, 60, 0.4);
        transition: opacity 0.2s;
    }

    /* Column labels are enabled only after the pointer rests on the chart (see
       BAR_HOVER_DELAY_MS). Hover is still tracked while inactive so the label
       appears as soon as the class lands, but no opacity change is applied, so
       a quick sweep does not repaint the chart column by column. */
    &.bars-active .bg:hover {
        rect,
        text {
            opacity: 1;
        }
    }

    .bg text {
        opacity: 0;
        fill: white;
        transition: opacity 0.2s;
        text-anchor: middle;
        alignment-baseline: middle;
        font-weight: 700;
    }
`;

/** Pointer dwell before the per-column labels become interactive. */
const BAR_HOVER_DELAY_MS = 200;

interface BarProps {
    values: number[];
    names: string[];
    colors?: string[];
    width?: number | string;
    height?: number | string;
}

const MIN_HEIGHT_IN_PIXEL = 4;

export const Bar: React.FC<BarProps> = (props: BarProps) => {
    const { height = '100%' } = props;
    const ref = useRef<any>(null);
    // The first render is the expensive one: every layer is a separate SVG
    // rect. Starting at the old default of 20 drew up to 20 layers per column
    // before the mount effect below read the real height and re-rendered with
    // the correct (much smaller) count. The overview mounts one of these per
    // board, so that wasted first pass dominated opening it. When the caller
    // already knows the pixel height (the board briefs do), start with the
    // count the effect would compute anyway; string heights keep the old
    // fallback and get corrected after layout.
    const initialMaxItemInCol =
        typeof height === 'number' && height > 0
            ? Math.max(1, Math.floor(height / MIN_HEIGHT_IN_PIXEL))
            : 20;
    const [maxItemInCol, setMaxItemInCol] = useState(initialMaxItemInCol);
    const [w2h, setW2H] = useState(1);
    const [hoverActive, setHoverActive] = useState(false);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelHoverTimer = () => {
        if (hoverTimer.current !== null) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
    };
    const onBarMouseEnter = () => {
        if (hoverActive || hoverTimer.current !== null) {
            return;
        }
        hoverTimer.current = setTimeout(() => {
            hoverTimer.current = null;
            setHoverActive(true);
        }, BAR_HOVER_DELAY_MS);
    };
    const onBarMouseLeave = () => {
        cancelHoverTimer();
        setHoverActive(false);
    };
    useEffect(() => cancelHoverTimer, []);
    const minHeightInPixel = MIN_HEIGHT_IN_PIXEL;
    useEffect(() => {
        const element = ref.current;
        if (element == null) return;
        const lis = () => {
            const h = element.clientHeight;
            // h is 0 before layout (and always under jsdom): keep the aspect
            // ratio at its initial 1 instead of poisoning the `text` y with
            // NaN, and clamp the column count to >= 1 so the layer maths
            // below can never divide by zero.
            setMaxItemInCol(Math.max(1, Math.floor(h / minHeightInPixel)));
            setW2H(h > 0 ? element.clientWidth / h : 1);
        };
        element.addEventListener('resize', lis);
        lis();
        return () => {
            element.removeEventListener('resize', lis);
        };
    }, [minHeightInPixel]);
    const { names, values } = props;
    if (names.length !== values.length) {
        throw new Error();
    }

    const margin = 2;
    const width = 100 / values.length - margin;
    const maxV = Math.max(...values);
    // Keep the fixed-height <svg> mounted even when every list is empty
    // (maxV === 0): the kanban brief card reserves this strip for the chart,
    // and dropping the whole element made the card grow ~26px *after*
    // the overview layout. Its CSS columns now reflow when this content grows,
    // and the reserved chart height keeps the card size stable as well. With
    // `scale = 0` every column draws n = 0 rects, and 0 * 0 === 0 keeps the
    // division-by-zero out.
    const scale = maxV > 0 ? maxItemInCol / maxV : 0;
    const layerHeight = (100 / maxItemInCol) * 0.6;
    const marginTop = (100 / maxItemInCol) * 0.4;
    return (
        // @ts-ignore
        <Svg
            className={hoverActive ? 'bars-active' : undefined}
            width="100%"
            height={height}
            viewBox={'0 0 100 100'}
            preserveAspectRatio="none"
            ref={ref}
            onMouseEnter={onBarMouseEnter}
            onMouseLeave={onBarMouseLeave}
        >
            {values.map((v, i) => {
                const n = scale < 1 ? Math.ceil(v * scale) : v;
                const arr = Array.from(Array(n).keys());
                return (
                    <g key={i} transform={`translate(${(width + margin) * i}, 0)`}>
                        <title>
                            "{names[i]}" has {v} cards
                        </title>
                        {arr.map((index) => {
                            const y = 100 - index * (layerHeight + marginTop) - layerHeight;
                            return (
                                <rect
                                    key={index}
                                    fill={'red'}
                                    x={0}
                                    y={y}
                                    width={width}
                                    height={layerHeight}
                                />
                            );
                        })}
                        <g className={'bg'}>
                            <rect x={-margin} y={0} width={width + 2 * margin} height={100} />
                            <text
                                x={width / 2}
                                y={50 / w2h}
                                fontSize={5.5}
                                transform={`scale(1, ${w2h})`}
                            >
                                {names[i]}
                            </text>
                        </g>
                    </g>
                );
            })}
        </Svg>
    );
};
