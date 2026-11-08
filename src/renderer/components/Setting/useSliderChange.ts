import { useCallback, useEffect, useRef } from 'react';

/**
 * Folds a burst of slider values into one change per animation frame.
 *
 * A slider reports one value per pointer event, and a pointer reports as fast
 * as the device does -- a 1000 Hz mouse hands the page up to a thousand
 * `onChange` calls per second while the thumb is dragged. Each one costs a
 * render of the slider (and, for the opacities, a repaint of the whole window),
 * which the screen can only ever show sixty times a second. The extra work is
 * invisible, but it is what makes the CPU climb while a slider is dragged
 * quickly.
 *
 * Only the latest value of a frame is applied, so a drag costs at most one
 * change per frame, and a single click, arrow key or programmatic change lands
 * on the next frame -- 16 ms, under the threshold where a thumb looks late.
 *
 * `cancel` drops the value that is still queued, for a caller that commits
 * something else in between (see `PreviewSlider`).
 *
 * `apply` has to be a stable callback (a `useCallback` handler or a
 * `useState` setter): a scheduled frame keeps the one it was created with.
 */
export function useSliderChange<T>(apply: (value: T) => void): [(value: T) => void, () => void] {
    const pending = useRef<{ value: T } | null>(null);
    const frame = useRef<number | null>(null);

    const cancel = useCallback(() => {
        if (frame.current != null) {
            window.cancelAnimationFrame(frame.current);
            frame.current = null;
        }
        pending.current = null;
    }, []);

    // A scheduled frame must not fire into an unmounted page.
    useEffect(() => cancel, [cancel]);

    const change = useCallback(
        (value: T) => {
            pending.current = { value };

            // A frame is already scheduled: it will pick up this value.
            if (frame.current != null) {
                return;
            }

            frame.current = window.requestAnimationFrame(() => {
                frame.current = null;
                const latest = pending.current;
                pending.current = null;
                if (latest) {
                    apply(latest.value);
                }
            });
        },
        [apply]
    );

    return [change, cancel];
}
