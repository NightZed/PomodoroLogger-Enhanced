/**
 * Regression: the list-count bar rendered nothing (`<></>`) while every list
 * was empty, so a freshly created board's brief card was ~26px shorter than
 * after its welcome card landed. react-stack-grid measures card heights only
 * when its children change (and during the render phase, against the previous
 * commit), so that late growth was never picked up: the boards below kept
 * their stale `top` and covered the bottom of the new board until the
 * overview was re-sorted or remounted. The fixed-height <svg> must be in the
 * DOM from the first render even when `values` are all zero, so the card
 * height never changes when the first card arrives.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Bar } from './Bar';

describe('Bar', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('keeps the fixed-height svg mounted when every value is 0', () => {
        act(() => {
            ReactDOM.render(<Bar names={['a', 'b']} values={[0, 0]} height={26} />, container);
        });

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg!.getAttribute('height')).toBe('26');
        // An all-zero chart draws no value rects (scale = 0 => n = 0), but the
        // svg shell itself must be there to reserve the strip.
        expect(svg!.querySelectorAll('rect[fill="red"]').length).toBe(0);
    });

    it('still renders the svg when some values are positive', () => {
        act(() => {
            ReactDOM.render(<Bar names={['a', 'b']} values={[0, 3]} height={26} />, container);
        });

        expect(container.querySelector('svg')).not.toBeNull();
    });

    it('throws on mismatched names/values (guard kept)', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => {
            act(() => {
                ReactDOM.render(<Bar names={['a']} values={[1, 2]} />, container);
            });
        }).toThrow();
        spy.mockRestore();
    });
});
