/**
 * Whether the periodic screenshot capture is available in this build.
 *
 * The feature is half finished: frames are captured, written to disk and their
 * paths stored on the session record, but nothing in the UI ever displays
 * them, and the capture path leaves a `<video>` plus a live `MediaStream`
 * behind when a stream never delivers a frame before `getScreen`'s timeout
 * (see `src/renderer/monitor/screenshot.ts`). It is therefore retired for
 * users: packaged builds neither show the toggle nor honour a value inherited
 * from an older version -- a hidden toggle that keeps capturing would leave no
 * way to turn it off -- while development builds keep it for the work on the
 * display side.
 *
 * `isPackaged` comes from the preload bridge; it is `undefined` in tests and in
 * a plain browser, which are treated as development builds on purpose.
 */
export function isScreenshotAvailable(isPackaged?: boolean): boolean {
    return isPackaged !== true;
}
