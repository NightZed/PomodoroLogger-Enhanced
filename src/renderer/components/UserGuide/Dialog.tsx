import React, { useEffect } from 'react';
import styled from 'styled-components';
import { getElementAbsoluteOffsetBySelector } from './utils';
import { Position } from './type';
import { Button, Divider } from 'antd';

const Container = styled.div`
    z-index: 2001;
    user-select: none;
    position: fixed;
    font-family: sans-serif, 'Lucida Sans', 'Microsoft YaHei';
`;

const Card = styled.div`
    font-size: 1rem;
    color: var(--pl-text);
    border-radius: 8px;
    background-color: var(--pl-bg-elevated);
    padding: 8px 0.8rem;
    max-width: 400px;
    box-shadow: 0 0 4px 4px var(--pl-shadow);
`;

export interface DialogProps {
    text?: string;
    position?: Position;
    targetSelector?: string;
    hasConfirm?: boolean;
    onConfirm?: () => void;
}

export const Dialog: React.FC<DialogProps> = (props: DialogProps) => {
    const {
        text,
        position = { bottom: 24, right: 36 },
        targetSelector,
        hasConfirm = true,
        onConfirm,
    } = props;
    useEffect(() => {
        if (targetSelector == null) {
            return;
        }
    }, [targetSelector]);
    return (
        <Container
            style={{
                ...position,
            }}
        >
            <Card>
                <p style={{ margin: 0 }}>{text}</p>
                {hasConfirm ? (
                    <>
                        <Divider style={{ margin: '6px 0' }} />
                        <Button onClick={onConfirm}>Confirm</Button>
                    </>
                ) : undefined}
            </Card>
        </Container>
    );
};
