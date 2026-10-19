import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const Svg = styled.svg`
    .bg rect {
        opacity: 0;
        fill: rgba(200, 80, 60, 0.4);
        transition: opacity 0.2s;
    }

    .bg:hover {
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

interface BarProps {
    values: number[];
    names: string[];
    colors?: string[];
    width?: number | string;
    height?: number | string;
}

export const Bar: React.FC<BarProps> = (props: BarProps) => {
    const { height = '100%' } = props;
    const ref = useRef<any>(null);
    const [maxItemInCol, setMaxItemInCol] = useState(20);
    const [w2h, setW2H] = useState(1);
    const minHeightInPixel = 4;
    useEffect(() => {
        if (ref.current == null) return;
        const lis = () => {
            if (ref.current == null) return;
            const h = ref.current.clientHeight;
            // h is 0 before layout (and always under jsdom): keep the aspect
            // ratio at its initial 1 instead of poisoning the `text` y with
            // NaN, and clamp the column count to >= 1 so the layer maths
            // below can never divide by zero.
            setMaxItemInCol(Math.max(1, Math.floor(h / minHeightInPixel)));
            setW2H(h > 0 ? ref.current.clientWidth / h : 1);
        };
        ref.current.addEventListener('resize', lis);
        lis();
        return () => {
            if (ref.current == null) return;
            ref.current.removeEventListener('resize', lis);
        };
    }, []);
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
            width="100%"
            height={height}
            viewBox={'0 0 100 100'}
            preserveAspectRatio="none"
            ref={ref}
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
