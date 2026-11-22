import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { pressable } from './pressable';

/**
 * `pressable` exists for elements that look and act like buttons but are not
 * `<button>`: browsers only synthesize a click from Enter/Space on real
 * buttons. The contract is only "these two keys reach the element's own click
 * handler"; the element's own behaviour, focus ring and role are not its
 * concern.
 */
describe('pressable', () => {
    const setup = () => {
        const onClick = jest.fn();
        render(
            <span {...pressable()} onClick={onClick}>
                tag
            </span>
        );
        return { onClick, element: screen.getByRole('button', { name: 'tag' }) };
    };

    it.each([
        ['Enter', 'Enter'],
        ['Space', ' '],
    ])('runs the click handler on %s', (_label, key) => {
        const { onClick, element } = setup();

        fireEvent.keyDown(element, { key });

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('ignores other keys, so the element keeps its own behaviour', () => {
        const { onClick, element } = setup();

        fireEvent.keyDown(element, { key: 'a' });

        expect(onClick).not.toHaveBeenCalled();
    });

    it('is reachable with the keyboard', () => {
        const { element } = setup();

        expect(element.getAttribute('tabindex')).toBe('0');
    });
});
