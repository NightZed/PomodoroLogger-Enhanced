function pad(value: number, width = 2): string {
    return String(Math.abs(value)).padStart(width, '0');
}

/**
 * `2026-11-05T19:12:33.451+08:00` -- local wall clock with an explicit UTC
 * offset.
 *
 * A timestamp is read by the person who hit the problem, so it should show the
 * time their clock showed, not UTC. Keeping the offset makes the instant
 * unambiguous for anyone correlating it with another machine (and keeps
 * consecutive moments explainable across a daylight-saving switch).
 *
 * Shared because both the log files (main process) and the crash screen
 * (renderer) print the same format.
 */
export function formatTimestamp(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes < 0 ? '-' : '+';
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetRest = Math.abs(offsetMinutes) % 60;

    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
        `${pad(date.getMilliseconds(), 3)}${sign}${pad(offsetHours)}:${pad(offsetRest)}`
    );
}
