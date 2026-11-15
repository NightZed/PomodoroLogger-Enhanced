import React, { useRef, useState } from 'react';
import { Slider } from 'antd';
import { KeyBadge } from './KeyBadge';

interface Props {
    /** Committed value, in the slider's own unit (minutes for the durations). */
    value: number;
    min?: number;
    max?: number;
    step?: number;
    marks?: React.ComponentProps<typeof Slider>['marks'];
    /**
     * Formats the readout shown in the badge to the right of the track.
     * Passing it renders the badge; omitting it keeps the bare slider.
     */
    formatValue?: (value: number) => string;
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
 * The antd tooltip is off and, when `formatValue` is passed, a `KeyBadge` to
 * the right of the track shows the live value instead. The popup chain it
 * replaces was measured at ~93% of a fast drag's main-thread time: the tooltip
 * re-renders per value change, re-aligns per frame and re-aligns again from
 * its ResizeObserver, while the badge is one text node in the slider's row.
 *
 * The badge has two writers and they never fight:
 * - React renders `formatValue(seed.value)` -- the value it was seeded with;
 * - during a drag, `onChange` writes the moving value straight into the text
 *   node, bypassing React entirely (one `textContent` assignment per pointer
 *   event, folded to the screen rate by the browser itself).
 *
 * React only rewrites a text node when its own recorded children change, and
 * the seed stays at the last seeded value until an outside change re-seeds it
 * -- so renders in between leave the dragged text untouched, and a re-seed
 * writes the outside value over it.
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
const PreviewSlider: React.FunctionComponent<Props> = ({
    value,
    formatValue,
    onPreview,
    onCommit,
    ...rest
}) => {
    const expected = useRef(value);
    const badgeRef = useRef<HTMLElement>(null);
    const [seed, setSeed] = useState({ value, version: 0 });

    if (value !== expected.current) {
        expected.current = value;
        setSeed((prev) => ({ value, version: prev.version + 1 }));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {formatValue && (
                <KeyBadge ref={badgeRef} style={{ marginBottom: 2, marginTop: -16 }}>
                    {formatValue(seed.value)}
                </KeyBadge>
            )}
            <Slider
                {...rest}
                tooltip={{ open: false }}
                key={seed.version}
                defaultValue={seed.value}
                // antd's slider adds its own top margin; dropping it keeps the
                // badge right above the track's right end instead of leaving a
                // gap, and the row's top stays level with the hint above.
                style={{ width: '100%', marginTop: 0 }}
                onChange={(v) => {
                    if (typeof v !== 'number') {
                        return;
                    }

                    if (formatValue) {
                        badgeRef.current!.textContent = formatValue(v);
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
        </div>
    );
};

export default PreviewSlider;
