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

const CenteredContainer = styled(Container)`
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.6);
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

const Title = styled.h4`
    margin: 0 0 4px 0;
`;

const ButtonRow = styled.div`
    display: flex;
    justify-content: flex-end;
`;

export interface DialogProps {
    text?: string;
    title?: string;
    position?: Position;
    centered?: boolean;
    targetSelector?: string;
    hasConfirm?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

export const Dialog: React.FC<DialogProps> = (props: DialogProps) => {
    const {
        text,
        title,
        position = { bottom: 24, right: 36 },
        centered = false,
        targetSelector,
        hasConfirm = true,
        confirmText = 'OK',
        cancelText,
        onConfirm,
        onCancel,
    } = props;
    useEffect(() => {
        if (targetSelector == null) {
            return;
        }
    }, [targetSelector]);
    const Wrapper = centered ? CenteredContainer : Container;
    return (
        <Wrapper
            style={
                centered
                    ? undefined
                    : {
                          ...position,
                      }
            }
        >
            <Card>
                {title ? <Title>{title}</Title> : undefined}
                <p style={{ margin: 0 }}>{text}</p>
                {hasConfirm ? (
                    <>
                        <Divider style={{ margin: '6px 0' }} />
                        <ButtonRow>
                            {cancelText !== undefined ? (
                                <Button onClick={onCancel} style={{ marginRight: 8 }}>
                                    {cancelText}
                                </Button>
                            ) : undefined}
                            <Button type="primary" onClick={onConfirm}>
                                {confirmText}
                            </Button>
                        </ButtonRow>
                    </>
                ) : undefined}
            </Card>
        </Wrapper>
    );
};
