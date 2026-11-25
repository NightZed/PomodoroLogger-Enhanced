/**
 * Milliseconds of the current local day's midnight.
 *
 * The renderer's single definition of "today": `getTodaySessions` filters at
 * this boundary, and the Timer page compares it against the day its cached
 * list came from to decide when that list is stale. Two copies of the
 * expression would let the query and the staleness check drift onto
 * different days.
 *
 * `now` is injectable so a caller that needs both ends of the day can derive
 * them from one instant instead of two `new Date()` reads that could straddle
 * midnight.
 */
export function todayStart(now = new Date()): number {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Milliseconds of the next local day's midnight — the exclusive upper bound of
 * "today". A lower bound alone lets every session dated in the future into
 * today's list, which is what happens after the system clock is moved forward,
 * a session is recorded, and the clock is moved back. `History` already
 * filters on both ends (`dateStart`/`nextDay`); this is the same range for the
 * renderer's own query.
 */
export function tomorrowStart(now = new Date()): number {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}
