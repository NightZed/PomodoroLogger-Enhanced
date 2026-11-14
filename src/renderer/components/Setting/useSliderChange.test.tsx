/**
 * The sliders of the settings page, as far as the CPU is concerned: what one
 * drag actually pushes through the store.
 *
 * A pointer reports at its own rate (a 1000 Hz mouse: a thousand events per
 * second), while the page can only show sixty. Applying every event made a fast
 * drag cost one Redux dispatch, one render of the settings section and -- for
 * the opacity sliders -- one whole-window repaint per event, which is what
 * pushed a core to 100% while a thumb was being dragged.
 */
import * as React from 'react';
import { render } from '@testing-library/react';
import { useSliderChange } from './useSliderChange';

/** Last handler the harness rendered, i.e. the one the slider would receive. */
let push: (value: number) => void = () => undefined;
let cancel: () => void = () => undefined;

const Harness: React.FunctionComponent<{ apply: (value: number) => void }> = ({ apply }) => {
    [push, cancel] = useSliderChange(apply);
    return null;
};

const frame = () => {
    jest.advanceTimersByTime(20);
};

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

// Regression: applying every pointer event cost one dispatch, one render and
// (for opacity) one whole-window repaint per event, pinning a core during a drag.
it('applies a single change, once the frame it was waiting for comes', () => {
    const apply = jest.fn();
    render(<Harness apply={apply} />);

    push(25);
    expect(apply).not.toHaveBeenCalled();

    frame();
    expect(apply.mock.calls).toEqual([[25]]);

    // Nothing else is in flight afterwards.
    frame();
    expect(apply.mock.calls).toEqual([[25]]);
});

it('folds a burst of events into one change per frame, carrying the latest value', () => {
    const apply = jest.fn();
    render(<Harness apply={apply} />);

    // What a fast drag looks like: hundreds of events between two frames.
    for (let value = 1; value <= 100; value++) {
        push(value);
    }

    frame();
    expect(apply.mock.calls).toEqual([[100]]);
});

it('keeps a steady drag at one value per frame', () => {
    const apply = jest.fn();
    render(<Harness apply={apply} />);

    push(1);
    push(2);
    frame();
    push(3);
    push(4);
    frame();

    expect(apply.mock.calls).toEqual([[2], [4]]);
});

it('drops a queued value on cancel, which is what a commit uses', () => {
    const apply = jest.fn();
    render(<Harness apply={apply} />);

    push(1);
    cancel();
    frame();
    expect(apply).not.toHaveBeenCalled();

    push(2);
    frame();
    expect(apply.mock.calls).toEqual([[2]]);
});

it('drops a frame that is still pending when the page goes away', () => {
    const apply = jest.fn();
    const { unmount } = render(<Harness apply={apply} />);

    push(1);
    push(2);
    unmount();
    frame();

    expect(apply).not.toHaveBeenCalled();
});
