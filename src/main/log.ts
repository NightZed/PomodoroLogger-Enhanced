import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { logDir } from './config';
import { shouldLog } from '../shared/log';
import type { LogLevel } from '../shared/log';
import { formatTimestamp } from '../shared/formatTimestamp';

export { formatTimestamp };

/**
 * The only place this app writes log files.
 *
 * Packaged builds have no console on Windows: every `console.error` is lost,
 * which is why a renderer crash used to be invisible. Logs land in
 * `<dataDir>/logs` (next to -- not inside -- the databases), split by scope so
 * a bug report can carry only what matters:
 *
 * | file             | contents                                                  |
 * | ---------------- | --------------------------------------------------------- |
 * | `app.log`        | start banner, updater, IPC failures, worker fallbacks      |
 * | `active-win.log` | activity backend init result and failures (legacy name)    |
 * | `crash.log`      | renderer reports, uncaught exceptions, process crashes     |
 * | `data.log`       | import/export results and every import problem, delete     |
 * | `migration.log`  | one-off database migration report (`migrate.ts` writes it) |
 *
 * Writes are synchronous by design: a crash report has to reach the disk
 * before the process goes away, so there is nothing to await and nothing to
 * flush. To keep that cheap, the logger filters by level, collapses repeated
 * messages, caps lines per second and rotates each file at 1 MiB.
 */

export type LogScope = 'app' | 'active-win' | 'crash' | 'data';

const FILE_BY_SCOPE: Record<LogScope, string> = {
    app: 'app.log',
    'active-win': 'active-win.log',
    crash: 'crash.log',
    data: 'data.log',
};

/**
 * Scopes that ignore the configured level.
 *
 * A crash log that a setting could silence defeats its purpose, and `data.log`
 * is promised to the user by the import dialog ("the complete list is in the
 * log folder") -- a user who set the level to `error` would otherwise get an
 * empty file right after being told the details were written there.
 */
const LEVEL_EXEMPT_SCOPES: ReadonlySet<LogScope> = new Set(['crash', 'data']);

/** Per-file limit; three archives (`.1`..`.3`) keep the footprint bounded. */
const MAX_BYTES = 1024 * 1024;
const MAX_ARCHIVES = 3;
/** Long stack traces are the useful part but must not fill the file alone. */
const MAX_TEXT = 8 * 1024;
/** A repeating failure (the monitor polls every second) is written once. */
const DEDUPE_WINDOW_MS = 5_000;
/** Backstop against a loop that writes a fresh message every tick. */
const MAX_LINES_PER_SECOND = 20;

export interface LoggerOptions {
    dir: string;
    level?: LogLevel;
    /** Injected in tests so dedupe and rotation do not depend on wall time. */
    now?: () => number;
    maxBytes?: number;
}

export interface Logger {
    log(scope: LogScope, level: LogLevel, message: string, detail?: unknown): void;
    error(scope: LogScope, message: string, error: unknown): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    getDir(): string;
    getSessionId(): string;
}

function clip(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max)}… (truncated)`;
}

/** Turns anything into log text: errors keep their stack, objects their JSON. */
function describeDetail(detail: unknown): string | undefined {
    if (detail === undefined || detail === null) {
        return undefined;
    }
    if (detail instanceof Error) {
        return detail.stack || `${detail.name}: ${detail.message}`;
    }
    if (typeof detail === 'string') {
        return detail;
    }
    try {
        return JSON.stringify(detail);
    } catch {
        return String(detail);
    }
}

export function createLogger(options: LoggerOptions): Logger {
    const dir = options.dir;
    const now = options.now ?? Date.now;
    const maxBytes = options.maxBytes ?? MAX_BYTES;
    const sessionId = Math.random().toString(36).slice(2, 8);
    let configured: LogLevel = options.level ?? 'info';

    /** Bytes per file, seeded from disk on first use and advanced per write. */
    const sizes = new Map<string, number>();
    const seen = new Map<string, { at: number; count: number }>();
    let windowStart = 0;
    let windowLines = 0;
    let dropped = 0;
    let dirReady = false;

    function sizeOf(file: string): number {
        const cached = sizes.get(file);
        if (cached !== undefined) {
            return cached;
        }

        let size = 0;
        try {
            if (existsSync(file)) {
                size = statSync(file).size;
            }
        } catch {
            // A missing or unreadable file simply starts at zero.
        }
        sizes.set(file, size);
        return size;
    }

    /**
     * `app.log` -> `app.log.1` -> ... -> `app.log.3`. Windows refuses to rename
     * onto an existing file (EPERM) and an antivirus scan can hold the handle,
     * so the whole move is best effort: if it fails the logger keeps appending
     * and the file grows past the limit instead of losing lines.
     */
    function rotate(file: string): void {
        try {
            const oldest = `${file}.${MAX_ARCHIVES}`;
            if (existsSync(oldest)) {
                rmSync(oldest, { force: true });
            }
            for (let index = MAX_ARCHIVES - 1; index >= 1; index -= 1) {
                const from = `${file}.${index}`;
                if (existsSync(from)) {
                    renameSync(from, `${file}.${index + 1}`);
                }
            }
            renameSync(file, `${file}.1`);
            sizes.set(file, 0);
        } catch {
            // Keep appending to the current file.
        }
    }

    function append(file: string, text: string): void {
        try {
            if (!dirReady) {
                mkdirSync(dir, { recursive: true });
                dirReady = true;
            }

            const line = `${text}\n`;
            const bytes = Buffer.byteLength(line, 'utf-8');
            const current = sizeOf(file);
            if (current > 0 && current + bytes > maxBytes) {
                rotate(file);
            }
            appendFileSync(file, line, { encoding: 'utf-8' });
            sizes.set(file, (sizes.get(file) ?? 0) + bytes);
        } catch {
            // Diagnostics must never take the app down (or log about it).
        }
    }

    function write(scope: LogScope, level: LogLevel, message: string, detail?: unknown): void {
        // Crash and data records ignore the configured level: they are the
        // reason the file exists (see LEVEL_EXEMPT_SCOPES).
        if (!LEVEL_EXEMPT_SCOPES.has(scope) && !shouldLog(configured, level)) {
            return;
        }

        const stamp = now();

        // Collapse a repeating message: the monitor can fail every second.
        const key = `${scope}|${level}|${message}`;
        const previous = seen.get(key);
        if (previous && stamp - previous.at < DEDUPE_WINDOW_MS) {
            previous.count += 1;
            previous.at = stamp;
            return;
        }
        const repeats = previous?.count ?? 0;
        if (seen.size > 500) {
            seen.clear();
        }
        seen.set(key, { at: stamp, count: 0 });

        // Backstop for a loop that produces a distinct message every tick.
        if (scope !== 'crash') {
            if (stamp - windowStart >= 1000) {
                if (dropped > 0) {
                    append(
                        join(dir, FILE_BY_SCOPE.app),
                        `${formatTimestamp(new Date(stamp))} [${sessionId}] WARN  app: dropped ${dropped} lines (more than ${MAX_LINES_PER_SECOND}/s)`
                    );
                    dropped = 0;
                }
                windowStart = stamp;
                windowLines = 0;
            }
            if (windowLines >= MAX_LINES_PER_SECOND) {
                dropped += 1;
                return;
            }
            windowLines += 1;
        }

        const suffix = repeats > 0 ? ` (repeated ${repeats} times)` : '';
        const header = `${formatTimestamp(new Date(stamp))} [${sessionId}] ${level
            .toUpperCase()
            .padEnd(5)} ${scope}: ${clip(message, MAX_TEXT)}${suffix}`;
        const detailText = describeDetail(detail);
        const entry = detailText
            ? `${header}\n${clip(detailText, MAX_TEXT)
                  .split('\n')
                  .map((line) => `    ${line}`)
                  .join('\n')}`
            : header;

        append(join(dir, FILE_BY_SCOPE[scope]), entry);

        if (process.env.NODE_ENV === 'development') {
            const mirror =
                level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
            mirror(`[${scope}] ${message}`);
        }
    }

    return {
        log: (scope, level, message, detail) => write(scope, level, message, detail),
        error: (scope, message, error) => write(scope, 'error', message, error),
        setLevel: (level) => {
            configured = level;
        },
        getLevel: () => configured,
        getDir: () => dir,
        getSessionId: () => sessionId,
    };
}

let current: Logger | undefined;

/** The process-wide logger; the level is injected by `main.ts` before use. */
export function getLogger(): Logger {
    if (!current) {
        current = createLogger({
            dir: logDir,
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        });
    }
    return current;
}

export function configureLogging(options: { level: LogLevel }): void {
    getLogger().setLevel(options.level);
}

export function log(scope: LogScope, level: LogLevel, message: string, detail?: unknown): void {
    getLogger().log(scope, level, message, detail);
}

export function logError(scope: LogScope, message: string, error: unknown): void {
    getLogger().error(scope, message, error);
}

export function getLogDir(): string {
    return getLogger().getDir();
}

export function getSessionId(): string {
    return getLogger().getSessionId();
}

/**
 * One line per process start. Without it a bug report cannot tell which build
 * and which Electron version produced the rest of the file, and the session id
 * is what a screenshot of the error page is matched against.
 */
export function writeSessionBanner(context: Record<string, string | undefined>): void {
    const parts = Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`);
    getLogger().log('app', 'info', `start: ${parts.join(' ')}`);
}

/** Test hook: drops the singleton so a test can point the logger at a temp dir. */
export function resetLogger(logger?: Logger): void {
    current = logger;
}
