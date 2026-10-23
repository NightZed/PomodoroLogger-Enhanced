import * as React from 'react';
import styled from 'styled-components';
import { PomodoroRecord } from '../../monitor/type';
import { getIndexToTitleApp } from '../../monitor/sessionManager';
import { EfficiencyAnalyser } from '../../../shared/efficiency/efficiency';
import { ColorScheme } from './ColorEncoder';
import { formatTimeHMS } from './Timeline';

const Svg = styled.svg`
    transition: all 0.4s;
    .row {
        transition: transform 2.4s;
    }
`;

interface Props {
    record: PomodoroRecord;
    efficiencyAnalyser: EfficiencyAnalyser;
    sortBy?: string;
}

interface Row {
    app: string;
    title: string;
    activityIndex: number;
    isDistracting: boolean;
    time: number;
    ratio: number;
}

function getState(
    record: PomodoroRecord,
    efficiencyAnalyser: EfficiencyAnalyser,
    sortBy?: string
): Row[] {
    const ans: Row[] = [];
    let time = record.startTime;
    const indexToTitle = getIndexToTitleApp(record);
    for (let i = 0; i < record.stayTimeInSecond!.length; i += 1) {
        const stay = record.stayTimeInSecond![i];
        const index = record.switchActivities![i];
        const [title, app] = indexToTitle[index];
        const isDistracting = efficiencyAnalyser.getIsDistracting(app, title);
        ans.push({
            app,
            title,
            isDistracting,
            time,
            ratio: stay / record.spentTimeInHour / 3600,
            activityIndex: index,
        });

        time += stay;
    }

    switch (sortBy) {
        case 'app':
            ans.sort((a, b) => (a.app < b.app ? -1 : 1));
            break;
        case 'title':
            ans.sort((a, b) => (a.title < b.title ? -1 : 1));
            break;
        case 'index':
            ans.sort((a, b) => a.activityIndex - b.activityIndex);
            break;
        case 'isDistracting':
            ans.sort((a, b) => (a.isDistracting < b.isDistracting ? -1 : 1));
    }

    return ans;
}

export const PomodoroBlockVis = (props: Props) => {
    const { efficiencyAnalyser, record, sortBy } = props;
    const [state, setState] = React.useState(() => getState(record, efficiencyAnalyser, sortBy));
    React.useEffect(() => {
        setState(getState(record, efficiencyAnalyser, sortBy));
    }, [efficiencyAnalyser, record, sortBy]);
    // The schemes are stateful color maps: keeping them for the lifetime of
    // the chart avoids a different random color for the same app on every
    // record change.
    const [appColor, titleColor, isDistractingColor, indexColor] = React.useMemo(() => {
        return [new ColorScheme(), new ColorScheme(), new ColorScheme(), new ColorScheme()];
    }, []);

    const W = 1100;
    const axisMargin = 100;
    const itemWidth = (W - axisMargin) / 4;
    const H = 1000;
    const blocks = [];
    let y = 0;
    for (const row of state) {
        const itemHeight = row.ratio * H;
        blocks.push(
            <g transform={`translate(${0} ${y})`} key={row.activityIndex} className={'row'}>
                <title>{`${row.app}\n${row.title}\n${formatTimeHMS(row.time)}`}</title>
                <rect
                    fill={indexColor.get(row.activityIndex.toString())}
                    x={0}
                    y={0}
                    width={itemWidth}
                    height={itemHeight}
                />
                <rect
                    fill={appColor.get(row.app)}
                    x={itemWidth}
                    y={0}
                    width={itemWidth}
                    height={itemHeight}
                />
                <rect
                    fill={titleColor.get(row.title)}
                    x={itemWidth * 2}
                    y={0}
                    width={itemWidth}
                    height={itemHeight}
                />
                <rect
                    fill={isDistractingColor.get(row.isDistracting.toString())}
                    x={itemWidth * 3}
                    y={0}
                    width={itemWidth}
                    height={itemHeight}
                />
            </g>
        );

        y += itemHeight;
    }
    return (
        <Svg viewBox={'0 0 1100 1100'}>
            <g transform={`translate(${0} ${axisMargin})`}>{blocks}</g>
        </Svg>
    );
};
