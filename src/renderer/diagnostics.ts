import pkg from '../../package.json';
import { formatTimestamp } from '../shared/formatTimestamp';
import type { LogInfo } from '../main/ipc/type';

/**
 * The block of text both error surfaces put on the clipboard.
 *
 * The crash screen and the error notice report the same failure to the same
 * tracker, so they have to hand over the same fields: a report that is missing
 * the log folder or the session id cannot be matched against the log file it
 * refers to.
 */
export interface DiagnosticsSource {
    message: string;
    /** Error class, e.g. `TypeError`. Falls back to `Error`. */
    name?: string;
    stack?: string;
    componentStack?: string | null;
    /** What the failure belonged to (`timer.finished-session`). */
    scope?: string;
    /** `key=value` ids of a lost record; see `reportDataFailure`. */
    context?: string;
    /** Wall clock of the failure; defaults to now. */
    time?: Date;
}

/**
 * Formats the copyable details.
 *
 * `info` is filled in by the caller (the log lookup is async and must not be
 * awaited while rendering); when it is missing the two log lines are simply
 * left out rather than printing an empty path.
 */
export function diagnosticsText(source: DiagnosticsSource, info?: LogInfo): string {
    return [
        `Pomodoro Logger Enhanced ${pkg.version}`,
        `${source.name ?? 'Error'}: ${source.message}`,
        source.scope ? `Scope: ${source.scope}` : '',
        source.context ? `Context: ${source.context}` : '',
        source.stack ?? '',
        source.componentStack ? `\nComponent stack:${source.componentStack}` : '',
        info ? `Log folder: ${info.dir}` : '',
        info ? `Session: ${info.sessionId}` : '',
        // Local wall clock plus its UTC offset, the same format the log files
        // use: a bare Z timestamp makes the reader convert time zones by hand
        // to correlate the crash with what they were doing.
        `Time: ${formatTimestamp(source.time ?? new Date())}`,
        `User agent: ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
    ]
        .filter((line) => line !== '')
        .join('\n');
}
