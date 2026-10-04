import type { SourceData } from '../dataMerger/dataMerger';

/**
 * The on-disk shape of an exported data file.
 *
 * The file used to be the bare `SourceData`; it now carries a small header so
 * that the export answers the two questions a user has about a backup file
 * they find on disk months later: which app wrote it, and *when* -- both in the
 * file name (so consecutive exports never overwrite each other) and inside the
 * file (so the content itself says when it was taken).
 */
export const EXPORT_FORMAT = 'pomodoro-logger-export';

/** Bumped only on a breaking change of the file layout. */
export const EXPORT_VERSION = 1;

export interface ExportPayload {
    format: string;
    version: number;
    /** Epoch milliseconds, for machines. */
    exportedAt: number;
    /** Local `YYYY-MM-DD HH:mm:ss`, for the user reading the file. */
    exportedAtText: string;
    data: SourceData;
}

/** What the header says about the export, when the file has one. */
export interface ExportMeta {
    exportedAt?: number;
    exportedAtText?: string;
}

const pad = (value: number) => `${value}`.padStart(2, '0');

/** Local calendar date, e.g. `2026-10-04`. */
export function formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local wall clock, e.g. `15:04:05`. */
export function formatLocalTime(date: Date): string {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * The same stamp in a form that is legal in a file name: `:` is rejected by
 * Windows, so the time part is dash separated there and everywhere else, which
 * keeps the names sortable on every platform.
 */
export function formatFileStamp(date: Date): string {
    return `${formatLocalDate(date)}-${formatLocalTime(date).replace(/:/g, '-')}`;
}

/** Default name offered by the save dialog, e.g. `pomodoro-logger-data-2026-10-04-15-04-05.json`. */
export function buildExportFileName(date: Date): string {
    return `pomodoro-logger-data-${formatFileStamp(date)}.json`;
}

/** Wraps the data with the export header. */
export function buildExportPayload(data: SourceData, date: Date): ExportPayload {
    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: date.getTime(),
        exportedAtText: `${formatLocalDate(date)} ${formatLocalTime(date)}`,
        data,
    };
}

/**
 * A JSON object that is not an array: the shape every container in the export
 * has (and, defensively, the shape the file itself must have).
 */
export function isPlainObject(value: unknown): value is { [key: string]: any } {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Digs the data out of an import file, along with what its header says.
 *
 * Files written before the header existed -- and the automatic backups in
 * `db-bk/`, which are still written bare -- are the `SourceData` itself, so
 * anything that is not an export header is passed through as the data. The
 * header is recognised by its `format` marker rather than by "has a `data`
 * key", so a corrupt file is still reported as a corrupt file instead of
 * being silently treated as an empty export.
 */
export function unwrapImportPayload(raw: unknown): { data: unknown; meta: ExportMeta } {
    if (!isPlainObject(raw) || raw.format !== EXPORT_FORMAT) {
        return { data: raw, meta: {} };
    }

    return {
        data: raw.data,
        meta: {
            exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : undefined,
            exportedAtText: typeof raw.exportedAtText === 'string' ? raw.exportedAtText : undefined,
        },
    };
}
