/**
 * Hours are stored as floats derived from milliseconds. Rounding every sum
 * back to the same precision keeps repeated edits from drifting (0.1 + 0.2
 * style noise would otherwise accumulate in `spentHours` and card totals).
 */
export const HOUR_PRECISION = 1e6;

export const roundHours = (value: number): number =>
    Math.round(value * HOUR_PRECISION) / HOUR_PRECISION;
