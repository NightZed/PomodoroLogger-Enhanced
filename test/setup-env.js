// Jest setup that must run before the test framework (see `setupFiles` in
// jest.config.js): pin NODE_ENV and fill the few jsdom APIs antd relies on.
'use strict';

// Jest only defaults NODE_ENV to 'test' when it is not already defined in the
// outer shell. When a developer's environment exports NODE_ENV=development
// (or anything else), test-only branches guarded by
// `process.env.NODE_ENV === 'test'` (in-memory SQLite, the renderer's local
// repository wiring, ...) silently turn off and the suites exercise the
// production code paths instead. setupFiles run before any test module is
// loaded, so pin it here.
process.env.NODE_ENV = 'test';

// The i18n runtime resolves `'system'` through `navigator.language`. Pin it so
// a machine whose OS language is Chinese does not silently turn the English
// assertions in the suite into Chinese ones.
if (typeof window !== 'undefined') {
    Object.defineProperty(window.navigator, 'language', {
        value: 'en-US',
        configurable: true,
    });
}

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

// jsdom does not provide MessageChannel. Install a minimal spec-shaped one:
// `port2.postMessage` delivers asynchronously to `port1.onmessage` (across
// the pair, never back to the posting port), `close()` releases both ends,
// and `start()` drains messages queued before it. Older antd/rc-select
// scheduled open/close macros through MessageChannel and used to mount with
// "ReferenceError: MessageChannel is not defined" without it. The semantics
// matter beyond antd: the renderer's timer-free macrotask waits
// (`src/renderer/components/Timer/wait.ts`) hang on their first await under
// a self-delivering stub, so a draft of this polyfill must not regress to
// one (see `test/setupEnv.test.ts`).
if (typeof globalThis.MessageChannel === 'undefined') {
    class MessagePort {
        constructor() {
            this.started = false;
            this.queue = [];
            this.peer = null;
            this._onmessage = null;
        }
        // Attaching a listener starts the port per spec, so a caller that
        // never calls start() explicitly still receives messages.
        get onmessage() {
            return this._onmessage;
        }
        set onmessage(handler) {
            this._onmessage = handler;
            if (handler !== null) {
                this.start();
            }
        }
        start() {
            if (this.started) {
                return;
            }
            this.started = true;
            this.drain();
        }
        close() {
            this.started = false;
            this.onmessage = null;
            this.queue = [];
        }
        postMessage(value) {
            const deliver = () => {
                const peer = this.peer;
                if (peer === null) {
                    return;
                }
                peer.queue.push(value);
                if (peer.started) {
                    peer.drain();
                }
            };
            setTimeout(deliver, 0);
        }
        drain() {
            while (this.started && this.queue.length) {
                const msg = this.queue.shift();
                if (this.onmessage) {
                    this.onmessage({ data: msg });
                }
            }
        }
    }
    class MessageChannel {
        constructor() {
            this.port1 = new MessagePort();
            this.port2 = new MessagePort();
            this.port1.peer = this.port2;
            this.port2.peer = this.port1;
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
