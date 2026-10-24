import { DataMerger } from '../../shared/dataMerger/dataMerger';
import { aggHistory } from '../../utils/aggPomodoro';
import { WorkerMessage, WorkerMessageType, WorkerResponsePayload } from '../ipc/type';

type Response = WorkerResponsePayload[WorkerMessageType.MergeData];
export async function handleMergeData({
    payload: { external, source },
}: WorkerMessage<WorkerMessageType.MergeData>): Promise<Response> {
    let localSource = source;
    if (typeof source === 'string') {
        // Loaded lazily: the History aggregation uses this worker too, and it
        // must not pull the SQLite native module into a child process that only
        // needs pure aggregation.
        const { readAllData } = require('../io/read');
        localSource = await readAllData();
    }

    let warning = '';
    const merge = new DataMerger((s) => {
        warning += s + '\n';
    });
    const merged = merge.merge(localSource as any, external);
    const ans: Response = {
        merged,
    };
    if (warning) {
        ans.warning = warning;
    }

    return ans;
}

/**
 * History aggregation is CPU-heavy (tokenizing every app title for the word
 * cloud). It runs in this child process so a large year/All-time query cannot
 * block Electron's main event loop; the main process only reads the
 * lightweight records and forwards them.
 */
function hydrateApps(
    records: any[] | undefined,
    range?: { from: number; to: number }
): any[] | undefined {
    if (!records) {
        return undefined;
    }
    // Mutate in place: the payload itself is the only owner of these records,
    // so there is no second array/object graph to keep alive during aggregation.
    for (const record of records) {
        if (typeof record.apps !== 'string') {
            continue;
        }
        // The calendar/total only need startTime/spentTime. When a month is
        // selected, apps outside that month will never feed the treemap/word cloud,
        // so leave them as text and release the strings via `{}`.
        if (range && (record.startTime < range.from || record.startTime >= range.to)) {
            record.apps = {};
            continue;
        }
        try {
            record.apps = JSON.parse(record.apps);
        } catch {
            record.apps = {};
        }
    }
    return records;
}

export async function handleAggregateHistory({
    payload,
}: WorkerMessage<WorkerMessageType.AggregateHistory>): Promise<
    WorkerResponsePayload[WorkerMessageType.AggregateHistory]
> {
    const boardNames: { [boardId: string]: string } = {};
    for (const board of payload.boards) {
        boardNames[board._id] = board.name;
    }

    // The main process deliberately sends `apps` as text (see db/ipc.ts), so
    // the child owns the one JSON parse and the main process never holds the
    // parsed object graph. When a month is selected the repository sends a
    // scalar-only year and a separate period query, so only that month's apps
    // are parsed. The Today/Week/Month counters never use apps.
    let yearRecords: any[];
    let periodRecords: any[] | undefined;
    if (payload.periodRecords) {
        yearRecords = payload.yearRecords;
        periodRecords = hydrateApps(payload.periodRecords) ?? [];
    } else {
        yearRecords = hydrateApps(payload.yearRecords, payload.arg.periodRange) ?? [];
    }
    if (payload.recentRecords) {
        for (const record of payload.recentRecords) {
            if (typeof record.apps === 'string') {
                record.apps = {};
            }
        }
    }
    return aggHistory(
        payload.recentRecords ?? yearRecords,
        yearRecords,
        boardNames,
        payload.arg.periodRange,
        periodRecords
    );
}
