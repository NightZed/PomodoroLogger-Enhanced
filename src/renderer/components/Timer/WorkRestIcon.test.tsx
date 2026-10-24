import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { WorkRestIcon } from './WorkRestIcon';

const layers = (container: HTMLElement): HTMLElement[] => {
    const wrapper = container.querySelector('#timer-mode') as HTMLElement;
    return Array.from(wrapper.children) as HTMLElement[];
};

describe('WorkRestIcon', () => {
    afterEach(cleanup);

    it('animates the icon and the label themselves, not their descendants', () => {
        const { container } = render(<WorkRestIcon isWorking={false} isLongBreak={true} />);
        const [icon, label] = layers(container);

        // styled-components v6 (stylis 4) does not add the implicit "&" to a
        // nested selector that starts with ":" any more. With a bare
        // ":nth-child(1)" the fade rules compiled to a descendant selector and
        // matched the icon's <span class="anticon">, leaving the two layers
        // fully opaque on top of each other.
        expect(container.querySelectorAll('#timer-mode > div')).toHaveLength(2);
        expect(icon.className).toBe(label.className);
        expect(icon.className).not.toBe('');
        const rule = document.head.textContent || '';
        expect(rule).toContain(`.${icon.className.split(' ').pop()}:nth-child(1)`);
        expect(rule).not.toContain(`.${icon.className.split(' ').pop()} :nth-child(1)`);
    });

    it('keeps the break label on a single line', () => {
        const { container } = render(<WorkRestIcon isWorking={false} isLongBreak={true} />);
        const [, label] = layers(container);

        // The icon and the label share one slot; the label is the in-flow layer
        // that gives that slot its size, so it must stay on a single line.
        expect(label.textContent).toBe('Long Break');
        expect(window.getComputedStyle(label).whiteSpace).toBe('nowrap');
    });

    it('uses the same label size in work and break modes', () => {
        const working = render(<WorkRestIcon isWorking={true} isLongBreak={false} />);
        const workingLabel = layers(working.container)[1];
        const workingSize = window.getComputedStyle(workingLabel).fontSize;
        cleanup();

        const rest = render(<WorkRestIcon isWorking={false} isLongBreak={true} />);
        const restLabel = layers(rest.container)[1];

        // The label sizes the shared slot. A per-mode label size (the work
        // label used to have no 0.8em font-size) changes the slot height and
        // makes the number jump when the session type changes.
        expect(workingLabel.textContent).toBe('Working');
        expect(window.getComputedStyle(restLabel).fontSize).toBe(workingSize);
        expect(restLabel.style.fontSize).toBe(workingLabel.style.fontSize);
    });
});
