/**
 * One macrotask that does not ride on DOM timers or animation frames.
 *
 * The renderer uses this to wait while the window is hidden: an animation
 * frame never arrives while the window is fully occluded by other windows or
 * minimized to the tray (Windows occlusion tracking marks the page hidden and
 * stops sending BeginFrames), and once the page has been hidden for five
 * minutes Chromium throttles every DOM timer down to one wakeup per minute.
 * Between the two, a tray "Start Focusing" used to hang forever, and even its
 * own timeout could not fire because the check only ran between frames --
 * the timer moved again only once part of the window became visible.
 * MessageChannel macrotasks keep running through both, so the waits and the
 * timeouts that bound them survive an occluded window.
 */
export function nextMacroTask(): Promise<void> {
    return new Promise((resolve) => {
        const { port1, port2 } = new MessageChannel();
        // `start()` is explicit: assigning `onmessage` does not implicitly
        // start the port (the jsdom polyfill in `test/setup-env.js` follows
        // the spec here), so a message posted before it would sit queued.
        port1.start();
        port1.onmessage = () => {
            port1.close();
            port2.close();
            resolve();
        };
        port2.postMessage(undefined);
    });
}

export async function waitUntil(cond: () => boolean, timeout = 10000): Promise<void> {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) {
            throw new Error('Timeout');
        }

        await nextMacroTask();
    }
}
