import React from 'react';
import { Tooltip, TooltipProps } from 'antd';

/**
 * Hover hints fall into two kinds, and the difference is how often the text is
 * worth reading a second time:
 *
 * - `static` (the default) — the same sentence on every hover: a button's
 *   action, a toggle's name. It is learned once, so it waits
 *   `HINT_STATIC_DELAY_MS` before opening and a pointer sweeping a toolbar no
 *   longer flashes a label over every icon it crosses.
 * - `live` — the label follows the data behind the trigger: a card's full
 *   title, a pomodoro's time and efficiency, the current timer state. Waiting
 *   to read changed content defeats the purpose, so it opens on the first
 *   frame, like the treemap and calendar labels.
 *
 * Everything else is shared: Hint owns the trigger (antd's own enter delay plus
 * zoom/fade reads as lag), and GlobalStyle collapses the transition to 0s.
 *
 * An empty label returns the child unchanged: antd would otherwise keep an
 * empty overlay in the DOM and wire hover handlers for nothing.
 */
export const HINT_STATIC_DELAY_MS = 400;

export type HintKind = 'static' | 'live';

export interface HintProps {
    label?: React.ReactNode;
    children: React.ReactElement;
    /** `static` waits `HINT_STATIC_DELAY_MS`; `live` opens immediately. */
    kind?: HintKind;
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
    const {
        label,
        children,
        kind = 'static',
        placement,
        maxWidth,
        getPopupContainer,
        zIndex,
    } = props;
    const [open, setOpen] = React.useState(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(
        () => () => {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
            }
        },
        []
    );

    const empty =
        label === undefined || label === null || (typeof label === 'string' && label.trim() === '');

    if (empty) {
        return children;
    }

    const cancelPendingOpen = () => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const trigger = React.cloneElement(children as React.ReactElement<HintTriggerProps>, {
        onMouseEnter: (event: React.MouseEvent) => {
            (children.props as HintTriggerProps).onMouseEnter?.(event);
            // Re-entering before the delay elapsed restarts it rather than
            // leaving a stale timer that would open over the next element.
            cancelPendingOpen();
            if (kind === 'live') {
                setOpen(true);
                return;
            }
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                setOpen(true);
            }, HINT_STATIC_DELAY_MS);
        },
        onMouseLeave: (event: React.MouseEvent) => {
            (children.props as HintTriggerProps).onMouseLeave?.(event);
            cancelPendingOpen();
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
