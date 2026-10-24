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
    white-space: nowrap;
    text-align: center;
    will-change: opacity;

    /* The two layers share one slot. The label is the in-flow layer, so it
       gives the slot a real size; the icon is centred on top of it. That lets
       ProgressTextContainer centre the whole block (number + mode) in the
       circle instead of only the number: an absolutely positioned pair leaves
       the slot 0px tall, so the label hangs below the centred box.
       The "&" is required: styled-components v6 (stylis 4) no longer prefixes
       nested selectors that start with ":", so ":nth-child(1)" would compile
       to a *descendant* selector (".layer :nth-child(1)") and match the icon's
       <span class="anticon"> instead of the layer itself. That left both the
       icon and the label fully opaque and overlapping. */
    &:nth-child(1) {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation-name: ${fade};
        animation-fill-mode: both;
        animation-iteration-count: 1;
        animation-duration: 2s;
        animation-direction: alternate-reverse;
    }

    /* Both labels use the same size (0.8em of the wrapper's 0.6em). The label
       is the in-flow layer that sizes the shared slot, so a per-mode size would
       change the slot height and make the number jump ~3px when switching
       between a work session and a break. */
    &:nth-child(2) {
        font-size: 0.8em;
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
                <FadeEffect key={`label-${animationKey}`}>
                    {props.isLongBreak ? 'Long Break' : 'Short Break'}
                </FadeEffect>
            )}
        </div>
    );
};
