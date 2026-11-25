/**
 * Milliseconds of the current local day's midnight.
 *
 * The renderer's single definition of "today": `getTodaySessions` filters at
 * this boundary, and the Timer page compares it against the day its cached
 * list came from to decide when that list is stale. Two copies of the
 * expression would let the query and the staleness check drift onto
 * different days.
 */
export function todayStart(): number {
    return new Date(new Date().toDateString()).getTime();
}
