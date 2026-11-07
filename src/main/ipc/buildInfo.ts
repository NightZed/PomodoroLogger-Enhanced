/**
 * Command line hand-over of `app.isPackaged`, so the renderer can tell an
 * installed build from a development run without an extra IPC round trip.
 *
 * Passed through `webPreferences.additionalArguments` exactly like the initial
 * theme and language: the sandboxed preload reads it synchronously, and the
 * settings page has to decide on its first paint whether to draw a toggle (one
 * that appears and then disappears would be worse than none).
 */
export const PACKAGED_ARGUMENT = '--pl-packaged=';

export function encodeBuildInfo(isPackaged: boolean): string {
    return PACKAGED_ARGUMENT + (isPackaged ? '1' : '0');
}

/**
 * Defaults to `false` so tests, a plain browser and any process that did not go
 * through `createWindow` are treated as development builds.
 */
export function parseBuildInfo(argv: readonly string[]): boolean {
    return argv.includes(PACKAGED_ARGUMENT + '1');
}
