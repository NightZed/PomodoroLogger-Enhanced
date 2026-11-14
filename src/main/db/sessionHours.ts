import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import { normalizeAppHours } from '../../shared/normalizeAppHours';
import type {
    RecalibrateSessionHoursOptions,
    RecalibrateSessionHoursResult,
    SessionHourEntry,
    SessionHourGroup,
    SessionHoursReport,
} from '../../shared/sessionHours';
import type { PomodoroRecord } from '../../renderer/monitor/type';
import { log } from '../log';

/** Entries each group previews. The dialog is a preview, not a table. */
const PREVIEW_LIMIT = 10;

/**
 * The smallest difference worth reporting, in hours.
 *
 * This has to be at least one `roundHours` grid step (1e-6 h = 3.6 ms),
 * because the calibration writes every value back through `roundHours`:
 * after a rewrite each session can still be off by half a step, and a
 * tighter threshold would count all of them again -- the "calibrate, reopen,
 * still 3,313 sessions and four seconds" loop.
 */
const EPSILON_HOURS = 1e-6;

/**
 * Rows read per page.
 *
 * The whole table in one query is a single synchronous block: on the dev
 * database (3.2k sessions) it holds the main process for ~160 ms, and the
 * window cannot composite meanwhile. 250 rows is ~13 ms, one frame or less.
 */
const SCAN_BATCH = 250;

/**
 * Full documents parsed and written per transaction.
 *
 * 500 documents cost ~90 ms just to parse and re-stringify. Splitting also
 * means each batch commits on its own, which is safe here: a calibration is
 * per-session and idempotent, so an interrupted run leaves some rows still in
 * need of it, never a half-rewritten session.
 */
const WRITE_BATCH = 200;

/**
 * Hand the event loop back so the window can paint.
 *
 * Every SQLite call in this module is synchronous, so a sweep without this is
 * one long block: the click freezes the UI for the whole scan and the spinner
 * only appears after the work is already done.
 */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Grouped = {
    over: SessionHourEntry[];
    under: SessionHourEntry[];
    missing: SessionHourEntry[];
};

const emptyGroup = (): SessionHourGroup => ({
    total: 0,
    totalDeltaSeconds: 0,
    preview: [],
});

/**
 * Splits every session into the three calibrable groups, one page at a time.
 *
 * Sessions with no total (`spentTimeInHour <= 0`) are skipped: there is
 * nothing to scale them to, and a negative value left behind by an old clock
 * change must not be "fixed" into something invented.
 */
async function collectGroups(): Promise<Grouped> {
    const groups: Grouped = { over: [], under: [], missing: [] };
    const total = DBs.sessionDB.sessionCountSync();
    for (let offset = 0; offset < total; offset += SCAN_BATCH) {
        for (const row of DBs.sessionDB.appHoursSync(SCAN_BATCH, offset)) {
            const sessionHours = row.spentTimeInHour ?? 0;
            const appHours = row.appHours ?? 0;
            if (!Number.isFinite(sessionHours) || sessionHours <= 0) {
                continue;
            }
            if (!Number.isFinite(appHours)) {
                continue;
            }

            const entry: SessionHourEntry = {
                sessionId: row._id,
                startTime: row.startTime ?? 0,
                sessionHours,
                appHours,
                deltaSeconds: (appHours - sessionHours) * 3600,
            };

            if (appHours <= EPSILON_HOURS) {
                // No breakdown at all: report the whole session as unattributed
                // instead of a negative difference with nothing to compare.
                groups.missing.push({ ...entry, deltaSeconds: sessionHours * 3600 });
            } else if (entry.deltaSeconds > EPSILON_HOURS * 3600) {
                groups.over.push(entry);
            } else if (entry.deltaSeconds < -EPSILON_HOURS * 3600) {
                groups.under.push(entry);
            }
        }
        await yieldToEventLoop();
    }

    return groups;
}

function summarize(
    entries: SessionHourEntry[],
    sort: (a: SessionHourEntry, b: SessionHourEntry) => number
): SessionHourGroup {
    if (entries.length === 0) {
        return emptyGroup();
    }

    let totalDeltaSeconds = 0;
    for (const entry of entries) {
        totalDeltaSeconds += Math.abs(entry.deltaSeconds);
    }

    return {
        total: entries.length,
        totalDeltaSeconds,
        preview: [...entries].sort(sort).slice(0, PREVIEW_LIMIT),
    };
}

/**
 * The calibration preview: three groups, each with the full count, the summed
 * difference, and the first ten entries.
 *
 * `over` and `under` sort by the size of the difference, largest first, so the
 * suspended-machine outliers are what the user sees. `missing` has no
 * difference to rank, so it sorts by start time, newest first.
 */
export async function scanSessionHours(): Promise<SessionHoursReport> {
    await loadDBs(['sessionDB']);
    const groups = await collectGroups();
    return {
        over: summarize(groups.over, (a, b) => b.deltaSeconds - a.deltaSeconds),
        under: summarize(groups.under, (a, b) => a.deltaSeconds - b.deltaSeconds),
        missing: summarize(groups.missing, (a, b) => b.startTime - a.startTime),
    };
}

function chunk<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < values.length; i += size) {
        chunks.push(values.slice(i, i + size));
    }
    return chunks;
}

/**
 * Rewrites the selected groups, one transaction per batch.
 *
 * The scan is repeated here instead of trusting the report the renderer holds:
 * that report is a snapshot, and the user may have finished a pomodoro or
 * imported a file between opening the dialog and confirming. Re-scanning also
 * means the renderer never names the rows to rewrite.
 *
 * A batch is a few hundred documents: one transaction over the whole history
 * is a single multi-second block on the main process, during which the window
 * stops painting. Each batch commits before the next one starts, so an
 * interrupted run leaves the remaining rows untouched rather than a partial
 * session -- and because the rewrite is idempotent, running it again finishes
 * the job.
 */
export async function recalibrateSessionHours(
    options: RecalibrateSessionHoursOptions
): Promise<RecalibrateSessionHoursResult> {
    await loadDBs(['sessionDB']);
    const groups = await collectGroups();
    const ids: string[] = [];
    if (options.over) {
        ids.push(...groups.over.map((entry) => entry.sessionId));
    }
    if (options.under) {
        ids.push(...groups.under.map((entry) => entry.sessionId));
    }

    if (ids.length === 0) {
        return { repaired: 0, skipped: 0 };
    }

    // `findSync` returns complete documents: the calibration replaces the
    // authoritative `doc` column as well as the two JSON columns.
    const sessions = DBs.sessionDB as unknown as SqliteRepository;
    let repaired = 0;
    let skipped = 0;

    for (const batch of chunk(ids, WRITE_BATCH)) {
        const records = sessions.findSync<PomodoroRecord>({ _id: { $in: batch } });
        const changed: PomodoroRecord[] = [];
        for (const record of records) {
            const result = normalizeAppHours(record, record.spentTimeInHour);
            if (result.changed) {
                changed.push(record);
            } else {
                skipped += 1;
            }
        }
        if (changed.length > 0) {
            runInTransaction(() => DBs.sessionDB.applyAppHoursSync(changed));
            repaired += changed.length;
        }
        await yieldToEventLoop();
    }

    log(
        'data',
        'info',
        `app-hours calibration repaired=${repaired} skipped=${skipped} ` +
            `over=${options.over} under=${options.under}`
    );

    return { repaired, skipped };
}
