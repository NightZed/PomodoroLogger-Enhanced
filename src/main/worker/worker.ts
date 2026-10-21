import { WorkerMessage, WorkerMessageType, WorkerResponse } from '../ipc/type';
import { handleAggregateHistory, handleMergeData } from './dataHandlers';

const handlers: { [T in WorkerMessageType]: (msg: WorkerMessage<T>) => void } = {
    [WorkerMessageType.MergeData]: async (msg) => {
        const payload = await handleMergeData(msg);
        send({
            payload,
            id: msg.id || Math.random(),
            type: msg.type,
        });
    },
    [WorkerMessageType.AggregateHistory]: async (msg) => {
        const payload = await handleAggregateHistory(msg);
        send({
            payload,
            id: msg.id || Math.random(),
            type: msg.type,
        });
    },
};

process.on('message', async <T extends WorkerMessageType>(msg: WorkerMessage<T>) => {
    const callback = handlers[msg.type];
    if (!callback) {
        return;
    }
    try {
        await callback(msg as any);
    } catch (error) {
        send({
            id: msg.id || Math.random(),
            type: msg.type,
            payload: undefined as any,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

function send(msg: WorkerResponse) {
    process.send!(msg);
}
