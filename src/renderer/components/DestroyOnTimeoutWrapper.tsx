import * as React from 'react';

interface Props {
    children: React.ReactElement;
    isVisible: boolean;
    timeout: number;
}

/**
 * Keeps a page subtree mounted for `timeout` ms after it goes inactive, then
 * drops it so the DOM, its listeners and whatever it cached are released.
 *
 * `useLayoutEffect`, not `useEffect`: coming back to a page that was already
 * dropped renders `<></>` first (that is what `hide` still says during this
 * pass) and only the effect clears it. With `useEffect` that second render
 * lands after the browser has painted, so the tab flashes an empty panel for a
 * frame. A layout effect runs before paint, so React re-renders the children
 * inside the same commit and nothing blank is ever shown.
 */
export const DestroyOnTimeoutWrapper: React.FC<Props> = React.memo((props: Props) => {
    const [hide, setHide] = React.useState(false);
    React.useLayoutEffect(() => {
        let timeout: undefined | number;
        if (!props.isVisible) {
            timeout = window.setTimeout(() => {
                setHide(true);
            }, props.timeout);
        }

        if (props.isVisible) {
            setHide(false);
        }

        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
        };
    }, [props.isVisible, props.timeout]);

    if (hide) {
        return <></>;
    }

    return <>{props.children}</>;
});
