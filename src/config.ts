/* istanbul ignore file */

/**
 * Runtime-tuning constants shared by the main process and the renderer.
 *
 * Deliberately free of `fs` / `path` / `process.platform`: the renderer is
 * sandboxed and only receives the filesystem locations it needs through
 * explicit preload methods (see `src/main/config.ts` for the main-process
 * layout).
 */

export const DEBUG_TIME_SCALE = 120;
export const __DEV__ = process.env.NODE_ENV === 'development';

/**
 * The factor the countdown clock runs at: `DEBUG_TIME_SCALE` outside
 * production, `1` in production.
 *
 * This is a *time span* scale, applied on both sides of `targetTime`:
 *
 * - writes compress the nominal duration (`scaleMs`), so a dev session of 25
 *   minutes ends after 25/120 minutes of wall time;
 * - reads expand the wall-clock span back to nominal before showing or
 *   comparing it (see `countdownSeconds` / `progressPercent` / `elapsedSeconds`
 *   in `Timer/sessionState.ts`).
 *
 * Statistics stay nominal: `spentTimeInHour` counts the configured duration,
 * and the monitor's wall-clock recordings are multiplied back up by the same
 * factor when a session is staged (`Timer.onFocusingSessionDone`).
 *
 * Mixing the two -- a compressed span measured against a nominal duration -- is
 * what used to leave the dev progress ring stuck at ~99%, show `00:13` instead
 * of `25:00` for a fresh session, and report a session almost fully elapsed the
 * moment it started.
 *
 * The gate is `!== 'production'` -- exactly what `startTimer` has always used,
 * so no environment changes behaviour. (The screenshot interval is the one
 * setting that scales under its own `=== 'development'` gate in
 * `setScreenShotInterval`; its persisted value must stay untouched in tests.)
 */
export function timeScale(): number {
    return process.env.NODE_ENV !== 'production' ? DEBUG_TIME_SCALE : 1;
}

/** Compress a nominal duration into the wall time the dev clock uses. */
export function scaleMs(nominalMs: number): number {
    return nominalMs / timeScale();
}
