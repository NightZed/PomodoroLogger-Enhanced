// Jest setup that must run before the test framework (see `setupFiles` in
// jest.config.js): pin NODE_ENV and fill the few jsdom APIs antd relies on.
'use strict';

// Jest only defaults NODE_ENV to 'test' when it is not already defined in the
// outer shell. When a developer's environment exports NODE_ENV=development
// (or anything else), test-only branches guarded by
// `process.env.NODE_ENV === 'test'` (FakeDBWorker, in-memory db paths, ...)
// silently turn off and the suites exercise the production code paths instead.
// setupFiles run before any test module is loaded, so pin it here.
process.env.NODE_ENV = 'test';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    });
}

// antd v6's rc-select schedules open/close macros via MessageChannel,
// which jsdom does not provide. Polyfill a minimal MessageChannel so
// Select/AutoComplete mount without "ReferenceError: MessageChannel is not defined".
if (typeof globalThis.MessageChannel === 'undefined') {
    class MessagePort {
        constructor() {
            this.handlers = [];
            this.queue = [];
            this.started = false;
        }
        start() {
            this.started = true;
            this.drain();
        }
        postMessage(value) {
            const deliver = () => {
                this.queue.push(value);
                if (this.started) this.drain();
            };
            setTimeout(deliver, 0);
        }
        drain() {
            while (this.queue.length) {
                const msg = this.queue.shift();
                this.handlers.forEach((h) => h({ data: msg }));
                if (this.onmessage) this.onmessage({ data: msg });
            }
        }
        addEventListener(type, handler) {
            if (type === 'message') this.handlers.push(handler);
        }
        removeEventListener() {}
    }
    class MessageChannel {
        constructor() {
            this.port1 = new MessagePort();
            this.port2 = new MessagePort();
        }
    }
    globalThis.MessageChannel = MessageChannel;
}

// antd v6 Popover/Select observe popup sizes with ResizeObserver on mount,
// which jsdom lacks.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
