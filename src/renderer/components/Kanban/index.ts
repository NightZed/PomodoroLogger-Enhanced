import { connect } from 'react-redux';
import type { Dispatch } from 'redux';

import { Kanban } from './Kanban';
import { RootState } from '../../reducers';
import { KanbanActionTypes, actions } from './action';
import { TimerActionTypes, actions as timerActions } from '../Timer/action';
import { actions as boardActions, BoardActionTypes } from './Board/action';
import { applySessionEditsAndRefresh } from '../../dataReload';
import { genMapDispatchToProp } from '../../utils';
import type { SessionEditsResult } from '../../../shared/sessionEdits';

const mapStateToProps = (state: RootState) => {
    return {
        ...state.kanban,
        timerManager: state.timer.timerManager,
        isFocusingOnChosenBoard: state.timer.boardId === state.kanban.kanban.chosenBoardId,
        isTimerRunning: state.timer.isRunning && state.timer.isFocusing,
        currentTab: state.timer.currentTab,
        chosenRecord: state.timer.chosenRecord,
    };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
    ...genMapDispatchToProp<KanbanActionTypes & BoardActionTypes & TimerActionTypes>({
        ...actions,
        ...boardActions,
        ...timerActions,
    })(dispatch),
    /**
     * The unassigned drawer's assignment runs in the main process; its result
     * has to land in `kanban.cards` as well, or the board keeps showing the old
     * card hours until a restart. It also invalidates History's calendar and
     * Timer's "today" dots, which read sessions directly.
     */
    applyEdits: (result: SessionEditsResult) =>
        dispatch(applySessionEditsAndRefresh(result) as any),
});
export default connect(mapStateToProps, mapDispatchToProps)(Kanban);
