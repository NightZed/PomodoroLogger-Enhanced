/**
 * A duration slider must not talk to the store while it is being dragged: that
 * is what re-rendered the whole timer page once per pointer event.
 *
 * The stand-in below keeps the real slider's two announcements apart -- one
 * `onChange` per step of the drag, one `onChangeComplete` when it ends.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('antd', () => {
    const React = require('react');
    const Slider = ({ value, onChange, onChangeComplete }: any) => {
        // The real slider keeps the dragged value internally, so the release
        // reports the position of the thumb even when the parent has not
        // re-rendered yet.
        const latest = React.useRef(value);
        return React.createElement(
            'div',
            null,
            React.createElement('input', {
                'data-testid': 'slider',
                value,
                onChange: (event: any) => {
                    latest.current = Number(event.target.value);
                    onChange?.(latest.current);
                },
            }),
            React.createElement('button', {
                'data-testid': 'release',
                onClick: () => onChangeComplete?.(latest.current),
            })
        );
    };
    return { Slider };
});

import PreviewSlider from './PreviewSlider';

const sliderValue = () => (screen.getByTestId('slider') as HTMLInputElement).value;

/** The preview is folded into one value per frame, like the other sliders. */
const frame = () => act(() => jest.advanceTimersByTime(20));

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

// Regression: committing per pointer event re-rendered the whole timer page
// (and, for the opacity sliders, repainted the window) on every event of a drag.
it('keeps a dragged value local and commits it once, when the drag ends', () => {
    const onCommit = jest.fn();
    render(<PreviewSlider value={15} onCommit={onCommit} />);

    expect(sliderValue()).toBe('15');

    fireEvent.change(screen.getByTestId('slider'), { target: { value: '20' } });
    frame();
    fireEvent.change(screen.getByTestId('slider'), { target: { value: '25' } });
    frame();

    // The page follows the thumb...
    expect(sliderValue()).toBe('25');
    // ...while the store has not heard about the drag at all. Only the last
    // value is handed over, on release.
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('release'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(25);
});

it('commits the value of the step that was still waiting for its frame', () => {
    const onCommit = jest.fn();
    render(<PreviewSlider value={15} onCommit={onCommit} />);

    // A drag that ends inside the same frame as its last pointer event: the
    // preview may still be queued, but the release names the value.
    fireEvent.change(screen.getByTestId('slider'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('release'));

    expect(onCommit).toHaveBeenCalledWith(30);
    // Nothing from the finished drag is applied afterwards.
    frame();
    expect(sliderValue()).toBe('15');
});

it('shows the committed value after the release, not a stale preview', () => {
    const onCommit = jest.fn();
    const { rerender } = render(<PreviewSlider value={15} onCommit={onCommit} />);

    fireEvent.change(screen.getByTestId('slider'), { target: { value: '25' } });
    frame();
    fireEvent.click(screen.getByTestId('release'));

    // What the store does right after the commit: the new value comes back as
    // the prop, and the preview must not fight it.
    rerender(<PreviewSlider value={25} onCommit={onCommit} />);
    expect(sliderValue()).toBe('25');

    fireEvent.change(screen.getByTestId('slider'), { target: { value: '30' } });
    frame();
    rerender(<PreviewSlider value={25} onCommit={onCommit} />);
    // A preview survives an unrelated re-render of the page.
    expect(sliderValue()).toBe('30');
});
