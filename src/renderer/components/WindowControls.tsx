import { Icon } from 'antd';
import React, { FC } from 'react';
import styled from 'styled-components';

/**
 * Caption buttons (minimize / maximize / close) for the frameless window
 * (`frame: false` in src/main/init.ts). Rendered on the right of the tabs row
 * in normal and compact mode; mini mode has no title bar at all.
 */
const Controls = styled.div<{ compact: boolean }>`
    /* The tabs row is the window drag region (see Application.tsx); the
       buttons must stay out of it so they remain clickable. */
    -webkit-app-region: no-drag;
    display: flex;
    align-items: stretch;
    height: 100%;

    button {
        width: ${({ compact }) => (compact ? '32px' : '44px')};
        height: 100%;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--pl-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        font-size: ${({ compact }) => (compact ? '12px' : '14px')};

        &:hover {
            background-color: var(--pl-bg-hover);
            color: var(--pl-text);
        }
    }

    button.win-close:hover {
        background-color: #e81123;
        color: #fff;
    }

    button.always-on-top-active {
        color: var(--pl-primary);
    }

    button.always-on-top-active:hover {
        color: var(--pl-primary);
    }
`;

interface Props {
    compact?: boolean;
    alwaysOnTop?: boolean;
    onToggleAlwaysOnTop?: () => void;
}

const WindowControls: FC<Props> = ({
    compact = false,
    alwaysOnTop = true,
    onToggleAlwaysOnTop,
}) => {
    const call = (action: 'minimize' | 'maximize' | 'close') => () =>
        window.api.windowAction(action);
    return (
        <Controls compact={compact}>
            {compact && onToggleAlwaysOnTop ? (
                <button
                    type="button"
                    title={alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
                    onClick={onToggleAlwaysOnTop}
                    className={alwaysOnTop ? 'always-on-top-active' : undefined}
                >
                    <Icon type="pushpin" />
                </button>
            ) : undefined}
            <button type="button" title="Minimize" onClick={call('minimize')}>
                <Icon type="minus" />
            </button>
            <button type="button" title="Maximize" onClick={call('maximize')}>
                <Icon type="border" />
            </button>
            <button type="button" className="win-close" title="Close" onClick={call('close')}>
                <Icon type="close" />
            </button>
        </Controls>
    );
};

export default WindowControls;
