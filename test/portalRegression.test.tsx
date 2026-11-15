/**
 * Regression tests for `patches/@rc-component__portal@2.2.1.patch`.
 *
 * The patch gates the container effect of `@rc-component/portal`: it has no
 * dependency array and used to call `setInnerContainer` on EVERY render,
 * leaning on React's eager bail-out (same value => no schedule) to stay
 * harmless. React 19 skips that bail-out while the fiber still has pending
 * lanes -- which, while a Slider's tooltip re-renders with the dragged value,
 * is every frame -- so each of those dispatches landed inside the
 * passive-effects flush that follows a commit, React's nested-update counter
 * accumulated, and fifty of them logged "Maximum update depth exceeded" while
 * any slider was dragged quickly (2026-11, fixed by gating the setState on a
 * value change).
 *
 * These tests pin the FORWARD behavior the gate must not break: the popup
 * still mounts into the element `getContainer` returns, follows it when the
 * target changes, and keeps updating across re-renders whose container does
 * not change. (Jest resolves this package to its CJS `lib/` build; the patch
 * was applied to both `es/` and `lib/`, and the two carry the same logic.)
 */
import * as React from 'react';
import { render } from '@testing-library/react';
import Portal from '@rc-component/portal';

describe('Portal container effect (patched @rc-component/portal)', () => {
    it('mounts the children into the element that getContainer returns', () => {
        const containerA = document.createElement('div');
        document.body.appendChild(containerA);

        render(
            <Portal open getContainer={() => containerA}>
                <span>popup</span>
            </Portal>
        );

        expect(containerA.querySelector('span')?.textContent).toBe('popup');

        containerA.remove();
    });

    it('follows the container when the getContainer target changes', () => {
        const containerA = document.createElement('div');
        const containerB = document.createElement('div');
        document.body.append(containerA, containerB);

        const { rerender } = render(
            <Portal open getContainer={() => containerA}>
                <span>popup</span>
            </Portal>
        );
        expect(containerA.querySelector('span')).not.toBeNull();

        rerender(
            <Portal open getContainer={() => containerB}>
                <span>popup</span>
            </Portal>
        );
        expect(containerB.querySelector('span')).not.toBeNull();
        // The gate must not leave a stale copy behind in the old container.
        expect(containerA.querySelector('span')).toBeNull();

        containerA.remove();
        containerB.remove();
    });

    // The drag scenario: the tooltip re-renders the Portal every frame while
    // the container element itself never changes.
    it('keeps mounting and updating across re-renders with a stable container', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const { rerender } = render(
            <Portal open getContainer={() => container}>
                <span>value 1</span>
            </Portal>
        );
        expect(container.querySelector('span')?.textContent).toBe('value 1');

        // The patch gates the container setState on a value change; the
        // children must keep flowing through.
        rerender(
            <Portal open getContainer={() => container}>
                <span>value 2</span>
            </Portal>
        );
        rerender(
            <Portal open getContainer={() => container}>
                <span>value 3</span>
            </Portal>
        );

        expect(container.querySelector('span')?.textContent).toBe('value 3');

        container.remove();
    });
});
