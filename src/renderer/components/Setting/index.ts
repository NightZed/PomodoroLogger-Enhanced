import { connect } from 'react-redux';
import type { Dispatch } from 'redux';

import { Setting } from './Setting';
import { RootState } from '../../reducers';
import { TimerActionTypes, actions } from '../Timer/action';
import { applyDataRepair } from '../Kanban/dataRepair';
import { genMapDispatchToProp } from '../../utils';
import type { DataRepairResult } from '../../../shared/dataRepair';

const mapStateToProps = (state: RootState) => state.timer;
const mapDispatchToProps = (dispatch: Dispatch) => ({
    ...genMapDispatchToProp<TimerActionTypes>(actions)(dispatch),
    // The data check removes and rewrites kanban rows; the settings page is
    // wired to the timer slice, so the one kanban action it needs is added here
    // instead of widening the timer action set.
    applyRepair: (result: DataRepairResult) => dispatch(applyDataRepair(result)),
});
export default connect(mapStateToProps, mapDispatchToProps)(Setting);
