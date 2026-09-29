import React, { useEffect } from 'react';
import styled from 'styled-components';
import { getElementAbsoluteOffsetBySelector } from './utils';
import { Position } from './type';
import { Button, Checkbox, Divider } from 'antd';

const Container = styled.div`
    z-index: 2001;
    position: fixed;
`;

const CenteredContainer = styled(Container)`
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--pl-mask);
    /* The backdrop must not start a text selection; the card below re-enables
       it, which is why the value is not set on the plain Container. */
    user-select: none;
`;

const Card = styled.div`
    font-size: 14px;
    color: var(--pl-text);
    border-radius: 8px;
    background-color: var(--pl-bg-elevated);
    border: 1px solid var(--pl-border);
    padding: 12px 16px;
    max-width: 420px;
    box-shadow: 0 4px 12px var(--pl-shadow);
    user-select: text;
`;

const Title = styled.h4`
    margin: 0 0 6px 0;
    font-size: 14px;
    font-weight: 600;
`;

const ButtonRow = styled.div`
    display: flex;
    justify-content: flex-end;
`;

const CheckboxRow = styled.div`
    margin-top: 8px;
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
    showBack?: boolean;
    onBack?: () => void;
    showExit?: boolean;
    onExit?: () => void;
    /** When given, an opt-out check box is rendered above the buttons. */
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
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
        showBack = false,
        onBack,
        showExit = false,
        onExit,
        checkboxLabel,
        checkboxChecked = false,
        onCheckboxChange,
        onConfirm,
        onCancel,
    } = props;
    const onCheckboxToggle = (e: { target: { checked: boolean } }) => {
        if (onCheckboxChange) {
            onCheckboxChange(e.target.checked);
        }
    };
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
                {checkboxLabel ? (
                    <CheckboxRow>
                        <Checkbox checked={checkboxChecked} onChange={onCheckboxToggle}>
                            {checkboxLabel}
                        </Checkbox>
                    </CheckboxRow>
                ) : undefined}
                {hasConfirm || showBack || showExit ? (
                    <>
                        <Divider style={{ margin: '6px 0' }} />
                        <ButtonRow>
                            {showExit ? (
                                <Button onClick={onExit} style={{ marginRight: 'auto' }}>
                                    Exit tour
                                </Button>
                            ) : undefined}
                            {showBack ? (
                                <Button onClick={onBack} style={{ marginRight: 8 }}>
                                    Back
                                </Button>
                            ) : undefined}
                            {cancelText !== undefined ? (
                                <Button onClick={onCancel} style={{ marginRight: 8 }}>
                                    {cancelText}
                                </Button>
                            ) : undefined}
                            {hasConfirm ? (
                                <Button type="primary" onClick={onConfirm}>
                                    {confirmText}
                                </Button>
                            ) : undefined}
                        </ButtonRow>
                    </>
                ) : undefined}
            </Card>
        </Wrapper>
    );
};
