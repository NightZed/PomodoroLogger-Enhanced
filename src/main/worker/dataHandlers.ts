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
export async function handleAggregateHistory({
    payload,
}: WorkerMessage<WorkerMessageType.AggregateHistory>): Promise<
    WorkerResponsePayload[WorkerMessageType.AggregateHistory]
> {
    const boardNames: { [boardId: string]: string } = {};
    for (const board of payload.boards) {
        boardNames[board._id] = board.name;
    }
    return aggHistory(
        payload.recentRecords ?? payload.yearRecords,
        payload.yearRecords,
        boardNames,
        payload.arg.periodRange
    );
}
