/**
 * A slider of the settings page, as far as the drag is concerned: the value
 * stays in the slider while the thumb moves, and the store hears about it once.
 *
 * The stand-in below mirrors the real slider's contract -- it owns the value
 * (`defaultValue`) and announces the end of the drag -- because that ownership
 * is the point. A controlled value that follows the thumb is what made a drag
 * feed React's nested-update counter ("Maximum update depth exceeded": rc-slider
 * copies every incoming value into its own state from a layout effect, so a
 * value that changes once per frame never settles).
 */
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('antd', () => {
    const React = require('react');
    const Slider = ({ defaultValue, onChangeComplete }: any) => {
        const [value, setValue] = React.useState(defaultValue);
        return React.createElement(
            'div',
            null,
            React.createElement('input', {
                type: 'range',
                'aria-label': 'Duration',
                min: 0,
                max: 60,
                value,
                onChange: (event: any) => setValue(Number(event.target.value)),
            }),
            React.createElement('button', { onClick: () => onChangeComplete?.(value) }, 'release')
        );
    };
    return { Slider };
});

import PreviewSlider from './PreviewSlider';

const slider = () => screen.getByRole('slider', { name: 'Duration' }) as HTMLInputElement;
const release = () => fireEvent.click(screen.getByRole('button', { name: 'release' }));

// Regression: committing per pointer event re-rendered the whole timer page on
// every event of a drag.
it('keeps a dragged value in the slider and commits it once, when the drag ends', () => {
    const onCommit = jest.fn();
    render(<PreviewSlider value={15} onCommit={onCommit} />);

    expect(slider().value).toBe('15');

    fireEvent.change(slider(), { target: { value: '20' } });
    fireEvent.change(slider(), { target: { value: '25' } });

    // The thumb follows the pointer...
    expect(slider().value).toBe('25');
    // ...while the store has not heard about the drag at all. Only the last
    // value is handed over, on release.
    expect(onCommit).not.toHaveBeenCalled();

    release();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(25);
});

// Regression: the store echoes the committed value back as the prop a moment
// later, which is indistinguishable from an outside change unless the commit is
// remembered. Re-seeding there remounted the slider under the pointer -- a lost
// drag, and lost focus for the arrow keys right after it.
it('keeps the focus on the slider when the store echoes the commit back', () => {
    const onCommit = jest.fn();
    const { rerender } = render(<PreviewSlider value={15} onCommit={onCommit} />);

    slider().focus();
    fireEvent.change(slider(), { target: { value: '25' } });
    release();

    rerender(<PreviewSlider value={25} onCommit={onCommit} />);

    expect(document.activeElement).toBe(slider());
});

it('follows the setting when it changes from somewhere else', () => {
    const onCommit = jest.fn();
    const { rerender } = render(<PreviewSlider value={15} onCommit={onCommit} />);

    // Restore defaults, another window, a value clamped on the way into the
    // store: the thumb has to move even though this slider never saw it.
    rerender(<PreviewSlider value={40} onCommit={onCommit} />);
    expect(slider().value).toBe('40');
});
