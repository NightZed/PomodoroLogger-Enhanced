import { AntdIcon as Icon } from '../../../renderer/components/antdIcon';
import * as React from 'react';
import styled, { css } from 'styled-components';

import PinSvg from '../../../res/pin.svg';

/**
 * The pin is entirely CSS driven.
 *
 * It belongs to a hovered card, so a CSS `:hover` rule on the card reveals it;
 * a React state change per mouseenter/mouseleave would re-render the whole
 * card on every sweep. Its own hover (rotation and color) is a deliberate,
 * isolated interaction: the transition is delayed so the pointer merely
 * crossing the icon during a sweep does not start an animation.
 */
const pinStyles = css`
    color: var(--pl-text);

    .anticon {
        opacity: 0;
        transform: rotate(45deg);
        transition:
            transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
            color 0.3s;
    }

    &.is-pinned {
        color: rgb(141, 84, 61);

        .anticon {
            opacity: 1;
            transform: rotate(0deg);
        }
    }

    &.is-rounded .anticon {
        opacity: 1;
    }

    &:hover .anticon {
        opacity: 1;
        transform: rotate(53deg);
        transition-delay: 0.15s;
    }

    &.is-pinned:hover .anticon {
        transform: rotate(8deg);
    }

    &:hover {
        color: var(--pl-text-secondary);
    }

    &.is-pinned:hover {
        color: #ee3500;
    }
`;

const RoundedContainer = styled.button`
    ${pinStyles}
`;

const Container = styled.div`
    display: inline-block;
    ${pinStyles}
`;

interface Props {
    isPin: boolean;
    isRounded?: boolean;
    onClick?: () => void;
    style?: any;
}

export const Pin: React.FC<Props> = (props: Props) => {
    const { isRounded = false } = props;
    const onClick = (e: any) => {
        if (props.onClick) {
            props.onClick();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
        }
    };

    const C = isRounded ? RoundedContainer : Container;

    return (
        // @ts-ignore
        <C
            className={[
                isRounded
                    ? 'ant-btn ant-btn-default ant-btn-circle ant-btn-sm ant-btn-icon-only'
                    : '',
                'pl-pin',
                props.isPin ? 'is-pinned' : '',
                isRounded ? 'is-rounded' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            style={props.style}
            onClick={onClick}
        >
            <Icon type={'pin' as any} component={PinSvg} />
        </C>
    );
};
