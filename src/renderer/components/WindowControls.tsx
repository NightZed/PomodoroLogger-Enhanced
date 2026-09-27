import { Icon } from 'antd';
import React, { FC } from 'react';
import styled from 'styled-components';

/**
 * Caption buttons (minimize / maximize / close) for the frameless window
 * (`frame: false` in src/main/init.ts). Rendered on the right of the tabs row
 * in normal and compact mode; mini mode has no title bar at all.
 */
const Controls = styled.div`
    /* The tabs row is the window drag region (see Application.tsx); the
       buttons must stay out of it so they remain clickable. */
    -webkit-app-region: no-drag;
    display: flex;
    align-items: stretch;
    height: 100%;

    button {
        width: 44px;
        height: 100%;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--pl-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        font-size: 14px;

        &:hover {
            background-color: var(--pl-bg-hover);
            color: var(--pl-text);
        }
    }

    button.win-close:hover {
        background-color: #e81123;
        color: #fff;
    }
`;

const WindowControls: FC = () => {
    const call = (action: 'minimize' | 'maximize' | 'close') => () =>
        window.api.windowAction(action);
    return (
        <Controls>
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
