import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import { Bar } from '../../../components/Visualization/Bar';

interface ListCountBarProps {
    boardId: string;
}

export const ListsCountBar = connect((state: RootState, props: ListCountBarProps) => {
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
})(Bar);
