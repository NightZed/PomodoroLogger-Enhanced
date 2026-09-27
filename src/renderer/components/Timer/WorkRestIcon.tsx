import RestIcon from '../../../res/rest.svg';
import WorkIcon from '../../../res/work.svg';
import React, { FunctionComponent } from 'react';
import { Icon } from 'antd';
import styled, { keyframes } from 'styled-components';

const fade = keyframes`
    0%,50% {
      opacity: 0;
    }
    
    100%{
      opacity: 1;
    }
`;

const FadeEffect = styled.div`
    user-select: none;
    position: absolute;
    left: 50%;
    text-align: center;
    transform: translateX(-50%);
    will-change: opacity;

    :nth-child(1) {
        animation-name: ${fade};
        animation-fill-mode: both;
        animation-iteration-count: 1;
        animation-duration: 2s;
        animation-direction: alternate-reverse;
    }

    :nth-child(2) {
        animation-name: ${fade};
        animation-fill-mode: both;
        animation-iteration-count: 1;
        animation-duration: 2s;
        animation-direction: alternate;
    }
`;

interface Props {
    isWorking: boolean;
    isLongBreak: boolean;
    onClick?: () => void;
}

export const WorkRestIcon: FunctionComponent<Props> = (props: Props) => {
    const animationKey = `${props.isWorking}-${props.isLongBreak}`;

    return (
        <div
            style={{ fontSize: '0.6em', cursor: 'pointer', position: 'relative' }}
            onClick={props.onClick}
            id={'timer-mode'}
        >
            <FadeEffect key={`icon-${animationKey}`}>
                {props.isWorking ? <Icon component={WorkIcon} /> : <Icon component={RestIcon} />}
            </FadeEffect>
            {props.isWorking ? (
                <FadeEffect key={`label-${animationKey}`}>Working</FadeEffect>
            ) : (
                <FadeEffect key={`label-${animationKey}`} style={{ fontSize: '0.8em' }}>
                    {props.isLongBreak ? 'Long Break' : 'Short Break'}
                </FadeEffect>
            )}
        </div>
    );
};
