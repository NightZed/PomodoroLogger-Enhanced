import { Timeline } from 'antd';
import * as React from 'react';
import { PomodoroRecord } from '../../monitor/type';
import { getIndexToTitleApp } from '../../monitor/sessionManager';
import { EfficiencyAnalyser } from '../../../shared/efficiency/efficiency';
import { to2digits } from '../../utils';

interface Props {
    record: PomodoroRecord;
    efficiencyAnalyser: EfficiencyAnalyser;
}

export function formatTimeHMS(time: number) {
    const date = new Date(time);
    const hour = to2digits(date.getHours());
    const m = to2digits(date.getMinutes());
    const s = to2digits(date.getSeconds());
    return `${hour}:${m}:${s}`;
}

export function formatTimeYMD(time: number) {
    const date = new Date(time);
    const y = date.getFullYear();
    return `${y}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function formatTimeYmdHms(time: number) {
    return `${formatTimeYMD(time)} ${formatTimeHMS(time)}`;
}

export function formatTimeHm(time: number) {
    const date = new Date(time);
    const hour = to2digits(date.getHours());
    const m = to2digits(date.getMinutes());
    return `${hour}:${m}`;
}

export function formatTimeYmdHm(time: number) {
    return `${formatTimeYMD(time)} ${formatTimeHm(time)}`;
}

export const PomodoroTimeline = (props: Props) => {
    const items: { color: string; content: React.ReactNode }[] = [];
    let time = props.record.startTime;
    const indexToTitle = getIndexToTitleApp(props.record);
    for (let i = 0; i < props.record.stayTimeInSecond!.length; i += 1) {
        const stay = props.record.stayTimeInSecond![i];
        const index = props.record.switchActivities![i];
        const [title, app] = indexToTitle[index];
        const isDistracting = props.efficiencyAnalyser.getIsDistracting(app, title);
        const sTime = formatTimeHMS(time);

        // antd v6: `Timeline children` / `Timeline.Item` are deprecated, the
        // `items` array takes `content` (renamed from `children`) instead.
        items.push({
            color: isDistracting ? 'red' : 'green',
            content: (
                <React.Fragment>
                    <p>{app}</p>
                    <p>{title}</p>
                    <p>{sTime}</p>
                </React.Fragment>
            ),
        });

        time += stay;
    }

    return <Timeline items={items} />;
};
