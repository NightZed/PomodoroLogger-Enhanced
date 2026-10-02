import { connect } from 'react-redux';
import { actions } from './actions';
import React, { FC } from 'react';
import { Dispatch } from 'redux';
import { Button } from 'antd';

interface InputProps {
    storyName: string;
    style?: any;
    /** When true, resume from saved `pl-tour-progress` step if it belongs to this tour. */
    resume?: boolean;
}

interface Props {
    showStory: () => void;
    resumeStory: () => void;
    resume?: boolean;
    style?: any;
    label?: string;
}

const _HelpIcon: FC<Props> = (props: Props) => {
    return (
        <Button
            icon={'question'}
            onClick={props.resume ? props.resumeStory : props.showStory}
            shape={'circle'}
            style={props.style}
            title={props.resume ? 'Resume guide' : 'Start guide'}
        />
    );
};

const readSavedStep = (): { stepId?: string; name?: string } => {
    try {
        return JSON.parse(window.localStorage.getItem('pl-tour-progress') || '{}');
    } catch (e) {
        return {};
    }
};

export const HelpIcon = connect(undefined, (dispatch: Dispatch, props: InputProps) => {
    return {
        showStory: () => dispatch(actions.startHelpByStoryName(props.storyName)),
        resumeStory: () => {
            const saved = readSavedStep();
            if (saved.stepId) {
                dispatch(actions.resumeByStepId(props.storyName, saved.stepId));
            } else {
                dispatch(actions.startHelpByStoryName(props.storyName));
            }
        },
    };
})(_HelpIcon as unknown as FC<InputProps & Props>);
