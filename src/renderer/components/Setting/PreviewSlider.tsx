import React, { useRef, useState } from 'react';
import { Slider } from 'antd';

interface Props {
    /** Committed value, in the slider's own unit (minutes for the durations). */
    value: number;
    min?: number;
    max?: number;
    step?: number;
    marks?: React.ComponentProps<typeof Slider>['marks'];
    /**
     * Called on every move of a drag, *before* the value is committed. Only
     * for settings whose effect is visible while the thumb moves: use it to
     * write straight to the DOM (a CSS custom property), never to the store --
     * a per-frame store write re-renders the whole application and, when the
     * renders fall behind the pointer, trips React's nested-update counter
     * (see the opacity sliders below).
     */
    onPreview?: (value: number) => void;
    /** Called once, when the thumb is released or the key lifted. */
    onCommit: (value: number) => void;
}

/**
 * A slider whose value is only committed when the drag ends.
 *
 * The other sliders of the settings page (the three opacities) also have to be
 * visible while the thumb moves, but they must not reach the store per frame:
 * their value is what the window is showing, yet a store write re-renders every
 * `connect()`ed component (the whole timer page, the whole application), and
 * when a fast drag makes the renders fall behind the pointer, each flush of
 * react-redux's `useSyncExternalStore` sees a changed snapshot and schedules
 * yet another render from inside React's passive effects -- fifty of those
 * consecutive and the console reports "Maximum update depth exceeded". They
 * therefore preview through `onPreview` (a CSS custom property write, folded to
 * once per frame) and commit once, on release.
 *
 * The slider is *uncontrolled* (`defaultValue`, re-keyed only when the setting
 * changes behind its back). A controlled `value` that follows the thumb is what
 * breaks: the rc slider mirrors every incoming value into its own state from a
 * layout effect, so a value that changes once per frame adds a nested update per
 * frame and React aborts the drag with "Maximum update depth exceeded" after
 * fifty of them. Left to the slider, a drag is one internal update per pointer
 * event and nothing in React's nested-update count.
 *
 * `expected` is what keeps the re-seeding honest: it is the value the store is
 * about to report (the one just committed) or the last one seen from outside.
 * The echo of our own commit therefore does not look like an outside change --
 * re-keying there would remount the slider under the pointer, dropping the drag
 * and the focus the arrow keys need right after it. Anything else that changes
 * the setting (`restore defaults`, the store finishing its read, a value clamped
 * on write) does not match and re-seeds the thumb.
 */
const PreviewSlider: React.FunctionComponent<Props> = ({ value, onPreview, onCommit, ...rest }) => {
    const expected = useRef(value);
    const [seed, setSeed] = useState({ value, version: 0 });

    if (value !== expected.current) {
        expected.current = value;
        setSeed((prev) => ({ value, version: prev.version + 1 }));
    }

    return (
        <Slider
            {...rest}
            key={seed.version}
            defaultValue={seed.value}
            onChange={(v) => {
                if (typeof v !== 'number') {
                    return;
                }

                onPreview?.(v);
            }}
            onChangeComplete={(v) => {
                if (typeof v !== 'number') {
                    return;
                }

                // The store is about to hold exactly this value; remembering it
                // keeps its echo from re-seeding the slider.
                expected.current = v;
                onCommit(v);
            }}
        />
    );
};

export default PreviewSlider;
