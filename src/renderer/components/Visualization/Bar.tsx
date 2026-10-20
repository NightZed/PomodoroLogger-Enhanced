import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import { Bar } from '../../../components/Visualization/Bar';

interface ListCountBarProps {
    boardId: string;
}

interface ListCountBarStateProps {
    values: number[];
    names: string[];
}

// `mapStateToProps` has to build arrays, so the default shallow comparison
// always saw new references and re-rendered every brief card's chart on each
// store notification (even a dispatch that has nothing to do with the board).
// Compare the chart data itself instead.
const sameChartData = (a: ListCountBarStateProps, b: ListCountBarStateProps) =>
    a.values.length === b.values.length &&
    a.names.length === b.names.length &&
    a.values.every((value, index) => value === b.values[index]) &&
    a.names.every((name, index) => name === b.names[index]);

export const ListsCountBar = connect(
    (state: RootState, props: ListCountBarProps): ListCountBarStateProps => {
        // The board can be deleted while this chart is still mounted (e.g. from
        // the board editor on the overview page); fall back to an empty chart
        // instead of crashing on the missing board.
        const board = state.kanban.boards[props.boardId];
        if (board === undefined) {
            return { values: [], names: [] };
        }
        const lists = board.lists.map((_id) => state.kanban.lists[_id]);
        return {
            values: lists.map((v) => v.cards.length),
            names: lists.map((v) => v.title),
        };
    },
    null,
    null,
    { areStatePropsEqual: sameChartData }
)(Bar);
