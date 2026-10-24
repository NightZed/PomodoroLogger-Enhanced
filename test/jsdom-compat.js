'use strict';

// jsdom does not implement the pseudo-element form of getComputedStyle:
// `getComputedStyle(element, '::before')` logs "Not implemented" through the
// virtual console and returns the element style anyway. rc-component's
// scrollbar measurement uses it while antd overlays mount, which floods the
// test output without changing what is being asserted. Strip the unsupported
// second argument; every other call keeps the exact jsdom behaviour.
const getComputedStyle = window.getComputedStyle.bind(window);

Object.defineProperty(window, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: (element) => getComputedStyle(element),
});
