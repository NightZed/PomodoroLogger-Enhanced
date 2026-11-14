import type { ApplicationSpentTime, PomodoroRecord } from '../renderer/monitor/type';
import { roundHours } from './hours';

/**
 * Rewrites a finished session's per-app hours so they add up to the session's
 * own `spentTimeInHour`.
 *
 * The recorder measures wall time, while `spentTimeInHour` is the nominal
 * session length: the ending tick lands 0.5–1s after the target, a pause
 * re-anchors a few milliseconds off, and a suspended machine can leave a much
 * larger gap behind. Left alone, every finished session makes the History
 * treemap (which sums `apps`) disagree with the total badge (which reads
 * `spentTimeInHour`), and the difference accumulates over thousands of
 * sessions.
 *
 * `stayTimeInSecond` is rescaled too, because the sankey chart and the
 * timeline read that array instead of the app hours. It is scaled against its
 * own sum, so both end up equal to the target even when a damaged record had
 * them disagreeing.
 *
 * The relative proportions between apps are preserved; only the absolute
 * hours move. `titleSpentTime[*].normalizedWeight` is a share of the session
 * and therefore needs no change.
 */
export interface NormalizeAppHoursResult {
    changed: boolean;
    /** Multiplier applied to the app hours; 1 when nothing changed. */
    factor: number;
}

const SECONDS_PRECISION = 1000;

const roundSeconds = (value: number): number =>
    Math.round(value * SECONDS_PRECISION) / SECONDS_PRECISION;

const sumOf = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);

/**
 * Adds the rounding remainder to the largest entry.
 *
 * Scaling each value and rounding it independently leaves the total a few
 * units off, which is exactly the kind of drift this function exists to
 * remove. The largest entry is the one where a sub-millisecond correction is
 * least visible.
 */
function absorbResidual(values: number[], target: number, round: (value: number) => number): void {
    if (values.length === 0) {
        return;
    }

    const residual = round(target - sumOf(values));
    if (residual === 0) {
        return;
    }

    let largest = 0;
    for (let i = 1; i < values.length; i += 1) {
        if (values[i] > values[largest]) {
            largest = i;
        }
    }

    values[largest] = round(values[largest] + residual);
}

/** Scales the app hours in place; returns the factor, or 1 when it could not. */
function scaleApps(apps: ApplicationSpentTime[], targetHours: number): number {
    const current = sumOf(apps.map((app) => app.spentTimeInHour ?? 0));
    if (!Number.isFinite(current) || current <= 0) {
        return 1;
    }

    const factor = targetHours / current;
    for (const app of apps) {
        app.spentTimeInHour = roundHours((app.spentTimeInHour ?? 0) * factor);
    }

    const corrected = apps.map((app) => app.spentTimeInHour);
    absorbResidual(corrected, targetHours, roundHours);
    for (let i = 0; i < apps.length; i += 1) {
        apps[i].spentTimeInHour = corrected[i];
    }

    return factor;
}

/** Scales the stay-time segments in place; true when anything moved. */
function scaleStayTime(record: PomodoroRecord, targetSeconds: number): boolean {
    const stay = record.stayTimeInSecond;
    if (stay == null || stay.length === 0) {
        return false;
    }

    const current = sumOf(stay);
    if (!Number.isFinite(current) || current <= 0) {
        return false;
    }

    const factor = targetSeconds / current;
    if (Math.abs(factor - 1) < 1e-9) {
        return false;
    }

    for (let i = 0; i < stay.length; i += 1) {
        stay[i] = roundSeconds(stay[i] * factor);
    }

    absorbResidual(stay, targetSeconds, roundSeconds);
    return true;
}

export function normalizeAppHours(
    record: PomodoroRecord,
    targetHours: number
): NormalizeAppHoursResult {
    if (!Number.isFinite(targetHours) || targetHours <= 0) {
        return { changed: false, factor: 1 };
    }

    const apps = Object.values(record.apps ?? {});
    let changed = false;
    let factor = 1;

    // No breakdown to scale: leave the record alone rather than invent an app
    // or zero the session.
    if (apps.length > 0) {
        factor = scaleApps(apps, targetHours);
        changed = Math.abs(factor - 1) >= 1e-9;
    }

    if (scaleStayTime(record, targetHours * 3600)) {
        changed = true;
    }

    return { changed, factor };
}
