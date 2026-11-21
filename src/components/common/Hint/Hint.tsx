import React from 'react';
import { Tooltip, TooltipProps } from 'antd';

/**
 * Shared hover hint.
 *
 * antd's Tooltip waits for its own enter delay and then runs a zoom/fade
 * transition, which reads as lag next to the treemap and calendar labels.
 * This wrapper owns the trigger instead: the overlay is controlled and opens
 * in the same event that the pointer enters the child, and GlobalStyle
 * collapses the transition to 0s.
 *
 * An empty label returns the child unchanged: antd would otherwise keep an
 * empty overlay in the DOM and wire hover handlers for nothing.
 */
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

/** The two handlers Hint chains onto the trigger element. */
interface HintTriggerProps {
    onMouseEnter?: React.MouseEventHandler;
    onMouseLeave?: React.MouseEventHandler;
}

export const Hint = (props: HintProps) => {
    const { label, children, placement, maxWidth, getPopupContainer, zIndex } = props;
    const [open, setOpen] = React.useState(false);
    const empty =
        label === undefined || label === null || (typeof label === 'string' && label.trim() === '');

    if (empty) {
        return children;
    }

    const trigger = React.cloneElement(children as React.ReactElement<HintTriggerProps>, {
        onMouseEnter: (event: React.MouseEvent) => {
            (children.props as HintTriggerProps).onMouseEnter?.(event);
            setOpen(true);
        },
        onMouseLeave: (event: React.MouseEvent) => {
            (children.props as HintTriggerProps).onMouseLeave?.(event);
            setOpen(false);
        },
    });

    return (
        <Tooltip
            open={open}
            trigger={[]}
            title={label}
            placement={placement}
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
            {trigger}
        </Tooltip>
    );
};
