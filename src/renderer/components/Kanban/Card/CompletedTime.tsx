import React, { CSSProperties, FC } from 'react';
import { CompletedTime as CompletedTimeStyle } from '../style/CreatedTime';
import { formatTimeYmdHm } from '../../Visualization/Timeline';

export interface CompletedTimeProps {
    completedTime?: number;
    // whether the card currently sits in the board's done list
    isInDoneList: boolean;
    style?: CSSProperties;
}

/**
 * Text shown under a card title once the card has been moved into the done
 * list at least once. Cards living in the done list show when they were
 * completed, cards dragged out again keep showing their last completion.
 */
export function formatCompletedTimeText(completedTime: number, isInDoneList: boolean) {
    return `${isInDoneList ? 'Completed' : 'Last completed'}: ${formatTimeYmdHm(completedTime)}`;
}

export const CompletedTime: FC<CompletedTimeProps> = ({ completedTime, isInDoneList, style }) => {
    if (completedTime === undefined) {
        return null;
    }

    return (
        <CompletedTimeStyle style={style}>
            {formatCompletedTimeText(completedTime, isInDoneList)}
        </CompletedTimeStyle>
    );
};
