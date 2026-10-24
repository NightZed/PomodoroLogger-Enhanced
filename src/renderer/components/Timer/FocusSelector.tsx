import React, { FunctionComponent } from 'react';
import { ConfigProvider, Select } from 'antd';
import { actions as timerActions } from './action';
import { RootState } from '../../reducers';
import { connect } from 'react-redux';
import { Dispatch } from 'redux';

const { Option } = Select;

interface Props {
    width?: number;
    chosenId: string | undefined;
    boards: RootState['kanban']['boards'];
    setId: (id?: string) => any;
}

const FocusSelectorInner: FunctionComponent<Props> = (props: Props) => {
    const onChange = (value: string) => {
        props.setId(value || undefined);
    };

    // Sort boards by creation time in descending order so the newest project
    // is rendered first in the dropdown, i.e. closest to the select box.
    // Legacy boards without createdTime are treated as the oldest.
    // Memoized because this component is on the always-mounted Timer page: a
    // card edit in the Kanban page used to recreate/sort every Option even
    // though the board list had not changed.
    const sortedBoards = React.useMemo(
        () =>
            Object.values(props.boards).sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0)),
        [props.boards]
    );

    const options = React.useMemo(
        () =>
            sortedBoards.map((v) => (
                <Option key={v._id} value={v._id} className="focus-option">
                    {v.name}
                </Option>
            )),
        [sortedBoards]
    );

    let style: any = {
        minWidth: 100,
        width: '100%',
    };

    if (props.width) {
        style = { width: props.width };
    }

    return (
        <ConfigProvider theme={{ token: { motionDurationMid: '120ms' } }}>
            <Select
                value={props.chosenId}
                style={style}
                placeholder="Choose Your Focus"
                onChange={onChange}
                id="focus-selector"
            >
                {options}
                <Option
                    key="no-focusing-project"
                    value=""
                    style={{ color: '#bfbfbf' }}
                    className="focus-option"
                >
                    No Focusing Project
                </Option>
            </Select>
        </ConfigProvider>
    );
};

export const FocusSelector = connect(
    (state: RootState) => ({
        chosenId: state.timer.boardId,
        // Only the board map is used. Selecting the whole `kanban` slice made
        // every list/card update re-render this always-mounted Timer control.
        boards: state.kanban.boards,
    }),
    (dispatch: Dispatch) => ({
        setId: (id?: string) => dispatch(timerActions.setBoardId(id)),
    })
)(FocusSelectorInner);
