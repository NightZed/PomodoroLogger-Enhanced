import RestIcon from '../../../res/rest.svg';
import WorkIcon from '../../../res/work.svg';
import React, { FunctionComponent } from 'react';
import { IconComponent as Icon } from '../antdIcon';
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
    /* Both layers are absolutely positioned in the same spot (icon first,
       then its label) and only one of them is visible at a time. The wrapper
       they live in has no in-flow content, so it is 0px wide; without nowrap
       "Long Break" would shrink to its min-content width and break in two. */
    white-space: nowrap;
    position: absolute;
    left: 50%;
    text-align: center;
    transform: translateX(-50%);
    will-change: opacity;

    /* The "&" is required: styled-components v6 (stylis 4) no longer prefixes
       nested selectors that start with ":", so ":nth-child(1)" would compile
       to a *descendant* selector (".layer :nth-child(1)") and match the icon's
       <span class="anticon"> instead of the layer itself. That left both the
       icon and the label fully opaque and overlapping. */
    &:nth-child(1) {
        animation-name: ${fade};
        animation-fill-mode: both;
        animation-iteration-count: 1;
        animation-duration: 2s;
        animation-direction: alternate-reverse;
    }

    &:nth-child(2) {
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
    'aria-label'?: string;
}

export const WorkRestIcon: FunctionComponent<Props> = (props: Props) => {
    const animationKey = `${props.isWorking}-${props.isLongBreak}`;

    return (
        <div
            style={{ fontSize: '0.6em', cursor: 'pointer', position: 'relative' }}
            onClick={props.onClick}
            id={'timer-mode'}
            data-tour={'timer-mode'}
            aria-label={props['aria-label'] ?? 'Switch timer mode'}
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
