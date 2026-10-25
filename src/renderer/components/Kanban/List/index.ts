import { connect } from 'react-redux';
import { List, InputProps } from './List';
import { KanbanActionTypes, actions as kanbanActions } from '../action';
import { RootState } from '../../../reducers';
import { ListActionTypes, actions } from './action';
import { actions as cardActions, CardActionTypes } from '../Card/action';
import { genMapDispatchToProp } from '../../../utils';
import { getCardView } from '../Board/action';

const mapStateToProps = (state: RootState, props: InputProps) => {
    return {
        ...state.kanban.lists[props.listId],
        searchReg: state.kanban.kanban.searchReg,
        cardsState: state.kanban.cards,
        cardView: getCardView(state.kanban.boards[props.boardId]),
    };
};

const mapDispatchToProps = genMapDispatchToProp<
    ListActionTypes & KanbanActionTypes & Pick<CardActionTypes, 'setContent'>
>({
    ...actions,
    ...kanbanActions,
    // Only `setContent` is consumed by the now-unconnected Card. Spreading all
    // card actions would overwrite the List's own `addCard` because both
    // action groups use that name.
    setContent: cardActions.setContent,
});
export default connect(mapStateToProps, mapDispatchToProps)(List);
