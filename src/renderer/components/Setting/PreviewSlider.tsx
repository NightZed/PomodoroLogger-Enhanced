import React, { useLayoutEffect, useRef, useState } from 'react';
import { Slider } from 'antd';
import styled from 'styled-components';
import { t } from '../../i18n';

interface Props {
    /** Committed value, in the slider's own unit (minutes for the durations). */
    value: number;
    min?: number;
    max?: number;
    step?: number;
    marks?: React.ComponentProps<typeof Slider>['marks'];
    /**
     * Formats the readout shown to the right of the track. Passing it renders
     * the readout (and its editor); omitting it keeps the bare slider.
     */
    formatValue?: (value: number) => string;
    /** Unit shown next to the number while editing, e.g. "min" or "%". */
    editUnit?: string;
    /** Accessible name of the slider handle. */
    ariaLabel?: string;
    /**
     * Called on every move of a drag, *before* the value is committed. Only
     * for settings whose effect is visible while the thumb moves: use it to
     * write straight to the DOM (a CSS custom property), never to the store --
     * a per-frame store write re-renders the whole application and, when the
     * renders fall behind the pointer, trips React's nested-update counter
     * (see the opacity sliders below).
     */
    onPreview?: (value: number) => void;
    /** Called once, when the thumb is released, the key lifted, or an edited value is accepted. */
    onCommit: (value: number) => void;
}

const Wrap = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    -webkit-app-region: no-drag;
    pointer-events: auto;
`;

/**
 * The track. antd draws all of the slider's geometry in CSS-in-JS, so the
 * white knob is restyled through this wrapper's descendant selectors, and the
 * mark labels are hidden here (rc-slider's own step dots are the ticks).
 */
const SliderSlot = styled.div`
    flex: 1 1 auto;
    min-width: 120px;
    display: flex;
    align-items: center;

    .ant-slider {
        flex: 1 1 auto;
        margin: 0;
    }

    /*
     * Doubling the wrapper class is deliberate: antd injects the mark styles
     * with the same class weight as a single wrapper class, and the comparison
     * then depends on stylesheet order. Repeating the wrapper class makes these
     * rules win regardless of which engine's sheet is inserted last.
     */
    && .ant-slider-with-marks {
        margin-bottom: 0;
    }

    && .ant-slider .ant-slider-handle::after {
        width: 100%;
        height: 100%;
        inset-block-start: 0;
        inset-inline-start: 0;
        background-color: #fff;
        box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.16),
            0 1px 2px rgba(0, 0, 0, 0.28);
        transition: box-shadow 0.15s ease;
    }

    && .ant-slider .ant-slider-handle:hover::after,
    && .ant-slider .ant-slider-handle:active::after {
        width: 100%;
        height: 100%;
        inset-block-start: 0;
        inset-inline-start: 0;
        background-color: #fff;
        outline: none;
        box-shadow:
            0 0 0 1px var(--pl-primary),
            0 1px 2px rgba(0, 0, 0, 0.28);
    }

    && .ant-slider .ant-slider-handle:focus::after,
    && .ant-slider .ant-slider-handle:focus-visible::after {
        width: 100%;
        height: 100%;
        inset-block-start: 0;
        inset-inline-start: 0;
        background-color: #fff;
        outline: none;
        box-shadow:
            0 0 0 2px var(--pl-primary),
            0 1px 2px rgba(0, 0, 0, 0.28);
    }

    /*
     * rc-slider renders two nodes per mark: an .ant-slider-dot in the step
     * layer (the tick on the rail) and an .ant-slider-mark-text label below
     * it. The label is hidden, not decorated with a dot of its own -- doing
     * both put a second tick below the rail.
     */
    && .ant-slider-mark-text {
        display: none;
    }
`;

const Readout = styled.button`
    flex: 0 0 auto;
    width: 72px;
    height: 26px;
    padding: 3px 8px;
    border: 1px solid var(--pl-border);
    border-radius: 6px;
    background-color: var(--pl-bg-hover);
    color: var(--pl-text);
    font-family: inherit;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: right;
    white-space: nowrap;
    cursor: text;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &:hover {
        border-color: var(--pl-primary);
    }

    &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--pl-primary);
    }
`;

const Editor = styled.span`
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    width: 72px;
    height: 26px;
    padding: 3px 8px;
    border: 1px solid var(--pl-primary);
    border-radius: 6px;
    background-color: var(--pl-bg-hover);
    box-sizing: border-box;

    &:focus-within {
        outline: none;
        box-shadow: 0 0 0 1px var(--pl-primary);
    }
`;

const Input = styled.input`
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--pl-text);
    font-family: inherit;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: right;

    &:focus {
        outline: none;
    }
`;

const Unit = styled.span`
    flex: 0 0 auto;
    font-size: 12px;
    line-height: 18px;
    color: var(--pl-text-secondary);
`;

/**
 * A slider whose value is only committed when the drag ends, with the current
 * value shown (and editable) to its right.
 *
 * The popup tooltip chain this replaced was measured at ~93% of a fast drag's
 * main-thread time: the tooltip re-renders per value change, re-aligns per
 * frame and re-aligns again from its ResizeObserver, while the readout is one
 * text node in the slider's row. That text node has three writers that agree:
 * - React renders `formatValue(seed.value)` -- the value it was seeded with;
 * - during a drag, `onChange` writes the moving value straight into the node,
 *   bypassing React entirely (one `textContent` assignment per pointer event,
 *   folded to the screen rate by the browser itself), and `liveValue` follows;
 * - leaving the editor remounts the node, so the layout effect writes
 *   `formatValue(liveValue.current)` before paint. A drag's commit is not an
 *   outside change and therefore does not re-seed, so without this the remount
 *   would fall back to the pre-drag seed.
 *
 * React only rewrites a text node when its own recorded children change; the
 * seed stays at the last seeded value for the whole drag, so renders in between
 * leave the dragged text untouched, and an outside change re-seeds the slider
 * and React writes the new value over it.
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
 *
 * The readout doubles as a numeric editor. It stays a `<button>` so a drag can
 * keep writing its text node; clicking it swaps in an input seeded with the
 * last live value (not the slider's seed, which a drag leaves behind). Enter or
 * blur commits (clamped to min/max), Escape cancels, and a rejected entry
 * leaves the setting alone.
 */
const PreviewSlider: React.FunctionComponent<Props> = ({
    value,
    formatValue,
    editUnit,
    ariaLabel,
    onPreview,
    onCommit,
    min,
    max,
    ...rest
}) => {
    const expected = useRef(value);
    /** The value last shown, including a drag whose store echo is still in flight. */
    const liveValue = useRef(value);
    const readoutRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const finished = useRef(false);
    const returnFocus = useRef(false);
    /** Read by the layout effect below without making the formatter a dependency. */
    const formatRef = useRef(formatValue);
    formatRef.current = formatValue;
    const [seed, setSeed] = useState({ value, version: 0 });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    if (value !== expected.current) {
        expected.current = value;
        liveValue.current = value;
        setSeed((prev) => ({ value, version: prev.version + 1 }));
    }

    useLayoutEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
            return;
        }

        if (!returnFocus.current) {
            return;
        }

        returnFocus.current = false;
        // Leaving the editor remounts the readout, and React renders it from
        // the slider's seed -- which a drag deliberately leaves behind (its
        // echo is not an outside change). Put the value the drag or editor
        // last showed back into the text node before this frame is painted.
        if (formatRef.current && readoutRef.current) {
            readoutRef.current.textContent = formatRef.current(liveValue.current);
        }
        readoutRef.current?.focus();
    }, [editing]);

    const clamp = (next: number) =>
        Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min ?? Number.MIN_SAFE_INTEGER, next));

    const startEdit = () => {
        if (!formatValue) {
            return;
        }

        finished.current = false;
        setDraft(String(liveValue.current));
        setEditing(true);
    };

    const finishEdit = (commit: boolean) => {
        if (finished.current) {
            return;
        }

        finished.current = true;
        returnFocus.current = true;
        setEditing(false);

        if (!commit) {
            return;
        }

        const parsed = Number(draft.trim());
        if (!Number.isFinite(parsed)) {
            return;
        }

        const next = clamp(Math.round(parsed));
        if (next === liveValue.current) {
            return;
        }

        // Re-seed the slider so its thumb sits on the typed value even before
        // the store reports it. `expected` is deliberately not updated here:
        // that guard exists to keep a *drag's* commit from remounting the
        // slider under the pointer. Typing has no pointer down and no focus on
        // the slider, so the store's echo may re-seed once more without harm.
        liveValue.current = next;
        setSeed((prev) => ({ value: next, version: prev.version + 1 }));
        onCommit(next);
    };

    return (
        <Wrap>
            <SliderSlot>
                <Slider
                    {...rest}
                    min={min}
                    max={max}
                    tooltip={{ open: false }}
                    ariaLabelForHandle={ariaLabel}
                    key={seed.version}
                    defaultValue={seed.value}
                    // The wrapper owns the row's geometry; antd's own margins
                    // would push the track off the label's centre line.
                    style={{ width: '100%', margin: 0 }}
                    onChange={(v) => {
                        if (typeof v !== 'number') {
                            return;
                        }

                        liveValue.current = v;
                        if (formatValue && readoutRef.current) {
                            readoutRef.current.textContent = formatValue(v);
                        }
                        onPreview?.(v);
                    }}
                    onChangeComplete={(v) => {
                        if (typeof v !== 'number') {
                            return;
                        }

                        liveValue.current = v;
                        // The store is about to hold exactly this value;
                        // remembering it keeps its echo from re-seeding.
                        expected.current = v;
                        onCommit(v);
                    }}
                />
            </SliderSlot>
            {formatValue &&
                (editing ? (
                    <Editor>
                        <Input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            aria-label={ariaLabel}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onBlur={() => finishEdit(true)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    finishEdit(true);
                                } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    finishEdit(false);
                                }
                            }}
                        />
                        {editUnit && <Unit>{editUnit}</Unit>}
                    </Editor>
                ) : (
                    <Readout
                        ref={readoutRef}
                        type="button"
                        aria-label={
                            ariaLabel
                                ? t('settings.slider.editValue', ariaLabel)
                                : t('settings.slider.editValueFallback')
                        }
                        onClick={startEdit}
                    >
                        {formatValue(seed.value)}
                    </Readout>
                ))}
        </Wrap>
    );
};

export default PreviewSlider;
