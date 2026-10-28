import { addWorkerListeners } from './util';

class FakeWorker {
    listeners: Array<(event: { data: any }) => void> = [];
    postMessage = jest.fn();

    addEventListener(_type: string, listener: (event: { data: any }) => void) {
        this.listeners.push(listener);
    }

    async emit(data: any) {
        for (const listener of this.listeners) {
            await listener({ data });
        }
    }
}

describe('addWorkerListeners', () => {
    it('forwards a handled message and returns the request code with the reply', async () => {
        const worker = new FakeWorker();
        addWorkerListeners(worker as any, {
            tokenize: (payload, done) => done({ type: 'tokenize', payload: payload.toUpperCase() }),
        });

        await worker.emit({ type: 'tokenize', payload: 'abc', code: 42 });

        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'tokenize',
            payload: 'ABC',
            code: 42,
        });
    });

    it('ignores message types without a handler', async () => {
        const worker = new FakeWorker();
        addWorkerListeners(worker as any, {});

        await worker.emit({ type: 'unknown', payload: 1, code: 1 });

        expect(worker.postMessage).not.toHaveBeenCalled();
    });

    it('posts an error reply when the handler throws', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const worker = new FakeWorker();
            addWorkerListeners(worker as any, {
                broken: () => {
                    throw new Error('boom');
                },
            });

            await worker.emit({ type: 'broken', payload: undefined, code: 7 });

            expect(worker.postMessage).toHaveBeenCalledWith({
                type: 'error',
                payload: 'Error: boom',
                code: 7,
            });
            expect(error).toHaveBeenCalled();
        } finally {
            error.mockRestore();
        }
    });

    it('awaits async handlers before replying', async () => {
        const worker = new FakeWorker();
        addWorkerListeners(worker as any, {
            load: async (_payload, done) => {
                await Promise.resolve();
                done({ type: 'load', payload: 'ready' });
            },
        });

        await worker.emit({ type: 'load', payload: undefined, code: 3 });

        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'load',
            payload: 'ready',
            code: 3,
        });
    });
});
