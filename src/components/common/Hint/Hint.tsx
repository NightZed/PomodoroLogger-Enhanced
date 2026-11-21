import React from 'react';
import { Tooltip, TooltipProps } from 'antd';

/**
 * Shared hover hint.
 *
 * The native `title` attribute waits about a second before showing, which is
 * why the app's hints felt unresponsive. A hint appears right after the
 * pointer stops (50ms) and every call site shares that pace.
 *
 * An empty label returns the child unchanged: antd would otherwise keep an
 * empty overlay in the DOM and wire hover handlers for nothing.
 */
export const HINT_ENTER_DELAY_SECONDS = 0.05;

export interface HintProps {
    label?: React.ReactNode;
    children: React.ReactElement;
    placement?: TooltipProps['placement'];
    /** Long text (a description) needs room; short button labels keep the default. */
    maxWidth?: number;
    /** Escape hatch for layers that must sit above a specific stacking context. */
    getPopupContainer?: TooltipProps['getPopupContainer'];
    zIndex?: number;
}

export const Hint = (props: HintProps) => {
    const { label, children, placement, maxWidth, getPopupContainer, zIndex } = props;
    const empty =
        label === undefined || label === null || (typeof label === 'string' && label.trim() === '');

    if (empty) {
        return children;
    }

    return (
        <Tooltip
            title={label}
            placement={placement}
            mouseEnterDelay={HINT_ENTER_DELAY_SECONDS}
            mouseLeaveDelay={0}
            getPopupContainer={getPopupContainer}
            styles={
                maxWidth === undefined && zIndex === undefined
                    ? undefined
                    : {
                          root: {
                              ...(maxWidth === undefined ? {} : { maxWidth }),
                              ...(zIndex === undefined ? {} : { zIndex }),
                          },
                      }
            }
        >
            {children}
        </Tooltip>
    );
};
