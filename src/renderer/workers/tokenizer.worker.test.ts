/**
 * The tokenizer worker owns the actual weight computation in the browser; a
 * broken message shape there silently produces an empty word cloud, so the
 * request/reply contract is worth pinning down without a real Worker.
 */
export {};

function loadWorker() {
    const listeners: ((event: { data: any }) => void)[] = [];
    const postMessage = jest.fn();
    const realSelf = (global as any).self;

    (global as any).self = {
        addEventListener: (type: string, listener: (event: { data: any }) => void) => {
            if (type === 'message') {
                listeners.push(listener);
            }
        },
        postMessage,
    };

    jest.isolateModules(() => {
        require('./tokenizer.worker');
    });

    (global as any).self = realSelf;

    return {
        postMessage,
        emit: async (data: any) => {
            await listeners[0]({ data });
        },
    };
}

describe('renderer/workers/tokenizer.worker', () => {
    it('replies with the weights for the given records and cards', async () => {
        const worker = loadWorker();

        await worker.emit({ code: 7, payload: { records: [], cards: [] } });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 7,
            type: 'tokenize',
            payload: [],
        });
    });

    it('reports malformed payloads back to the matching request', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const worker = loadWorker();

        await worker.emit({ code: 3, payload: null });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 3,
            type: 'error',
            payload: expect.any(String),
        });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
