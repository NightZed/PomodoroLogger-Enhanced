import { connect } from 'react-redux';
import { List, InputProps } from './List';
import { KanbanActionTypes, actions as kanbanActions } from '../action';
import { RootState } from '../../../reducers';
import { ListActionTypes, actions } from './action';
import { actions as cardActions, CardActionTypes } from '../Card/action';
import { genMapDispatchToProp } from '../../../utils';
import { getCardView } from '../Board/action';

const mapStateToProps = (state: RootState, props: InputProps) => {
    const list = state.kanban.lists[props.listId];
    const preview = props.preview === true;
    return {
        ...list,
        // The Timer sider is a separate view of the same data, not a second
        // owner of the board's view state: it never receives the search filter
        // and never reads/writes the shared `visibleCards`.
        searchReg: preview ? undefined : state.kanban.kanban.searchReg,
        visibleCards: preview ? undefined : list?.visibleCards,
        cardsState: state.kanban.cards,
        cardView: preview ? 'full' : getCardView(state.kanban.boards[props.boardId]),
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
