/**
 * What the "calibrate app hours" dialog shows and what it asks for.
 *
 * Three groups, because the three cases need different defaults:
 *
 * - `over`: the app breakdown adds up to more than the session's own
 *   `spentTimeInHour`. This is the accumulated wall-clock drift (the ending
 *   tick lands 0.5–1s late) plus the rarer suspended-machine gaps. Fixing it
 *   is the point of the dialog, so it starts selected.
 * - `under`: the breakdown adds up to less. That can be damage, but it is also
 *   the shape a hand-edited record takes when only the total was raised, so it
 *   starts unchecked.
 * - `missing`: no app breakdown at all (`apps` empty, or every entry zero).
 *   There is nothing to scale, so these are shown for information only.
 *
 * A group carries the full count and the summed difference, but only the first
 * ten entries: the dialog is a preview, not a table.
 */
export interface SessionHourEntry {
    sessionId: string;
    startTime: number;
    /** The session's own `spentTimeInHour`. */
    sessionHours: number;
    /** Sum of the per-app `spentTimeInHour` values. */
    appHours: number;
    /**
     * Seconds of difference. Positive in `over`, negative in `under`, and the
     * whole unattributed duration in `missing` (shown as "not counted").
     */
    deltaSeconds: number;
}

export interface SessionHourGroup {
    /** Every matching session, not just the previewed ones. */
    total: number;
    /** Sum of the absolute differences, in seconds. */
    totalDeltaSeconds: number;
    /** At most ten entries, already sorted for display. */
    preview: SessionHourEntry[];
}

export interface SessionHoursReport {
    over: SessionHourGroup;
    under: SessionHourGroup;
    missing: SessionHourGroup;
}

/**
 * Which groups the calibration should rewrite.
 *
 * The main process rescans before writing and never receives session ids from
 * the renderer: a report is a snapshot, and the ids in it may be stale by the
 * time the user confirms.
 */
export interface RecalibrateSessionHoursOptions {
    over: boolean;
    under: boolean;
}

export interface RecalibrateSessionHoursResult {
    /** Sessions actually rewritten. */
    repaired: number;
    /** Sessions that matched but had nothing to scale (already equal). */
    skipped: number;
}
