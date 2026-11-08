import React, { useState } from 'react';
import { Slider } from 'antd';
import { useSliderChange } from './useSliderChange';

interface Props {
    /** Committed value, in the slider's own unit (minutes for the durations). */
    value: number;
    min?: number;
    max?: number;
    step?: number;
    marks?: React.ComponentProps<typeof Slider>['marks'];
    /** Called once, when the thumb is released or the key lifted. */
    onCommit: (value: number) => void;
}

/**
 * A slider whose value is only committed when the drag ends.
 *
 * The other sliders of the settings page (the three opacities) have to reach the
 * store on every frame: their value is what the window is showing. A duration is
 * not -- nothing outside the settings page displays it while the thumb moves,
 * and the timer page sits behind this one. Holding the value in local state
 * therefore keeps a drag from being a store update, and keeps it from
 * re-rendering the whole timer page (progress ring, pomodoro wall, ...) once per
 * frame; that cascade is what made a fast drag cost a third of a core and grow
 * the renderer heap by tens of megabytes.
 *
 * The preview itself is folded to one value per frame: a slider re-render is not
 * free either, and a mouse can report several times per frame.
 *
 * `onChangeComplete` is fired by the rc slider on pointerup, at the end of a
 * track click and on keyup of the arrow/page keys, so a value can never be left
 * behind in the local state.
 */
const PreviewSlider: React.FunctionComponent<Props> = ({ value, onCommit, ...rest }) => {
    const [preview, setPreview] = useState<number | null>(null);
    const [showPreview, dropPreview] = useSliderChange(setPreview);

    return (
        <Slider
            {...rest}
            value={preview ?? value}
            onChange={(v) => {
                if (typeof v === 'number') {
                    showPreview(v);
                }
            }}
            onChangeComplete={(v) => {
                if (typeof v !== 'number') {
                    return;
                }

                // Anything still queued for the next frame belongs to the drag
                // that just ended; the commit below is the value that counts.
                dropPreview();

                // One batch: the store takes the value and the preview is
                // dropped together, so the thumb never jumps back.
                onCommit(v);
                setPreview(null);
            }}
        />
    );
};

export default PreviewSlider;
