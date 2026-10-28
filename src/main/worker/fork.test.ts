import { EventEmitter } from 'events';

jest.mock('child_process', () => ({ fork: jest.fn() }));

class FakeWorker extends EventEmitter {
    send = jest.fn();
    kill = jest.fn();
}

let worker: FakeWorker;
let forkMock: jest.Mock;
let sendWorkerMessage: typeof import('./fork').sendWorkerMessage;

describe('main/worker/fork', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        worker = new FakeWorker();
        forkMock = require('child_process').fork as jest.Mock;
        forkMock.mockReturnValue(worker);
        sendWorkerMessage = require('./fork').sendWorkerMessage;
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('forks once, sends the message and resolves with the matching reply', async () => {
        const request = sendWorkerMessage({ type: 'aggregate' } as any);

        expect(forkMock).toHaveBeenCalledTimes(1);
        const sent = worker.send.mock.calls[0][0];
        expect(sent.id).toBeDefined();

        worker.emit('message', { id: sent.id, payload: { total: 1 } });
        await expect(request).resolves.toEqual({ id: sent.id, payload: { total: 1 } });

        const second = sendWorkerMessage({ type: 'aggregate' } as any);
        expect(forkMock).toHaveBeenCalledTimes(1);
        const sentSecond = worker.send.mock.calls[1][0];
        worker.emit('message', { id: sentSecond.id, payload: { total: 2 } });
        await expect(second).resolves.toEqual({ id: sentSecond.id, payload: { total: 2 } });
    });

    it('rejects with the worker error reply', async () => {
        const request = sendWorkerMessage({ type: 'aggregate' } as any);
        const id = worker.send.mock.calls[0][0].id;

        worker.emit('message', { id, error: 'worker exploded' });

        await expect(request).rejects.toThrow('worker exploded');
    });

    it('rejects a request after its timeout and ignores a late reply', async () => {
        const request = sendWorkerMessage({ type: 'aggregate' } as any, 25);
        const id = worker.send.mock.calls[0][0].id;

        jest.advanceTimersByTime(26);

        await expect(request).rejects.toThrow('Worker request timeout after 25 ms');
        expect(() => worker.emit('message', { id, payload: 'late' })).not.toThrow();
    });

    it('rejects every pending request when the worker exits', async () => {
        const first = sendWorkerMessage({ type: 'aggregate' } as any);
        const second = sendWorkerMessage({ type: 'aggregate' } as any);

        worker.emit('exit', 1);

        await expect(first).rejects.toThrow('Worker process exited before reply');
        await expect(second).rejects.toThrow('Worker process exited before reply');
    });

    it('ignores messages without a pending request', async () => {
        const request = sendWorkerMessage({ type: 'aggregate' } as any);
        const id = worker.send.mock.calls[0][0].id;

        worker.emit('message', { id: 'unknown', payload: 'ignored' });
        worker.emit('message', { payload: 'no id' });
        worker.emit('message', { id, payload: 'right' });

        await expect(request).resolves.toEqual({ id, payload: 'right' });
    });
});
