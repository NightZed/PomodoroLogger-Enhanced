import React from 'react';
import { Spin } from 'antd';
import styled from 'styled-components';

const SpinContainer = styled.div`
    height: 100px;
    width: 100%;
    text-align: center;
    margin: 10px auto;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--pl-bg-hover);
`;

interface Props {
    size?: 'small' | 'default' | 'large';
    height?: number;
    width?: number;
    hideBackground?: boolean;
}

export const Loading: React.FC<Props> = (props: Props) => {
    const { hideBackground = false } = props;
    return (
        <SpinContainer
            style={{
                height: props.height,
                width: props.width,
                backgroundColor: hideBackground ? 'transparent' : undefined,
            }}
        >
            <Spin size={props.size} />
        </SpinContainer>
    );
};
