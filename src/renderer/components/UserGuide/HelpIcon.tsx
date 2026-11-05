import { connect } from 'react-redux';
import { actions } from './actions';
import React, { FC } from 'react';
import { Dispatch } from 'redux';
import { Button } from 'antd';
import { AntdIcon as Icon } from '../antdIcon';
import { useI18n } from '../../i18n';

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

const HelpIconBase: FC<Props> = (props: Props) => {
    const { t } = useI18n();
    return (
        <Button
            icon={<Icon type={'question'} />}
            onClick={props.resume ? props.resumeStory : props.showStory}
            shape={'circle'}
            style={props.style}
            title={props.resume ? t('tour.resumeGuide') : t('tour.startGuide')}
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
})(HelpIconBase as unknown as FC<InputProps & Props>);
