import type React from 'react';

/**
 * Keyboard access for elements that act as buttons but are not `<button>`:
 * a styled span/div, an antd Icon, a pin. Browsers only synthesize a click
 * from Enter/Space on real buttons, so these elements sit in the tab order and
 * forward the two keys to their own click handler.
 *
 * The handler is not duplicated: `currentTarget.click()` runs the element's
 * existing `onClick`, so stopPropagation and the click-through guards keep
 * working exactly as they do for the mouse.
 *
 * `data-pressable` is only a hook for the global focus ring (see GlobalStyle).
 */
export const pressable = () => ({
    role: 'button',
    tabIndex: 0,
    'data-pressable': true,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        // Space would otherwise scroll the page / activate the focused
        // scroll container before the click fires.
        event.preventDefault();
        event.currentTarget.click();
    },
});
