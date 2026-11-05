/**
 * Log levels, shared by the main process (which writes the files) and the
 * renderer (whose settings page chooses the level). It lives in `src/shared`
 * because the renderer may not import anything from `src/main`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Ordered from quietest to loudest; the UI renders them in this order. */
export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

const SEVERITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Whether a message at `level` should be written when the configured level is
 * `configured`. A configured level of `warn` writes warnings and errors only.
 */
export function shouldLog(configured: LogLevel, level: LogLevel): boolean {
    return SEVERITY[level] >= SEVERITY[configured];
}
