/**
 * Regression: the list-count bar rendered nothing (`<></>`) while every list
 * was empty, so a freshly created board's brief card was ~26px shorter than
 * after its welcome card landed. The fixed-height <svg> must be in the DOM from
 * the first render even when `values` are all zero, so the card height remains
 * stable as the first card arrives and the CSS column layout can reflow.
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Bar } from './Bar';

describe('Bar', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        container.remove();
    });

    it('keeps the fixed-height svg mounted when every value is 0', () => {
        render(<Bar names={['a', 'b']} values={[0, 0]} height={26} />, { container });

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg!.getAttribute('height')).toBe('26');
        // An all-zero chart draws no value rects (scale = 0 => n = 0), but the
        // svg shell itself must be there to reserve the strip.
        expect(svg!.querySelectorAll('rect[fill="red"]').length).toBe(0);
    });

    it('still renders the svg when some values are positive', () => {
        render(<Bar names={['a', 'b']} values={[0, 3]} height={26} />, { container });

        expect(container.querySelector('svg')).not.toBeNull();
    });

    it('only enables column labels after the pointer dwells', () => {
        jest.useFakeTimers();
        try {
            render(<Bar names={['a', 'b']} values={[0, 3]} height={26} />, { container });
            const svg = container.querySelector('svg')!;

            fireEvent.mouseEnter(svg);
            expect(svg.classList.contains('bars-active')).toBe(false);

            act(() => {
                jest.advanceTimersByTime(200);
            });
            expect(svg.classList.contains('bars-active')).toBe(true);

            fireEvent.mouseLeave(svg);
            expect(svg.classList.contains('bars-active')).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    it('throws on mismatched names/values (guard kept)', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => {
            render(<Bar names={['a']} values={[1, 2]} />, { container });
        }).toThrow();
        spy.mockRestore();
    });
});
