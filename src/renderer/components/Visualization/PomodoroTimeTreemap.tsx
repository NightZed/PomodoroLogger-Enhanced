import * as React from 'react';
import { PomodoroRecord } from '../../monitor/type';
import { getTimeSpentDataFromRecords, TimeSpentData } from '../History/op';
import { Loading } from '../utils/Loading';
import { TimeTreemap, Props } from '../../../components/Visualization/TimeTreemap';

interface PomodoroTimeTreemapProps extends Partial<Props> {
    pomodoros: PomodoroRecord[];
}

const PomodoroTimeTreemapImpl: React.FC<PomodoroTimeTreemapProps> = (
    props: PomodoroTimeTreemapProps
) => {
    const { pomodoros, ...restProps } = props;
    const [timeSpent, setTimeSpent] = React.useState<TimeSpentData>({
        projectData: [],
        appData: [],
    });
    const [isLoading, setIsLoading] = React.useState(true);
    React.useEffect(() => {
        getTimeSpentDataFromRecords(pomodoros).then((v) => {
            setTimeSpent(v);
            setIsLoading(false);
        });
    }, [pomodoros]);

    return isLoading ? (
        <Loading size={'large'} height={400} />
    ) : (
        <TimeTreemap {...timeSpent} {...restProps} />
    );
};

/**
 * Memoized for the timer page, which re-renders once a second: `pomodoros`
 * is a stored array and the remaining props are scalars, so recomputing the
 * treemap layout on every countdown tick is wasted work.
 */
export const PomodoroTimeTreemap = React.memo(PomodoroTimeTreemapImpl);
