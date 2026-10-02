import { BaseWorker, Message } from './BaseWorker';

class MWorker {
    private userListeners: { [name: string]: any[] } = { message: [] };
    terminated = false;
    constructor(private workerListeners: { [name: string]: any }) {}

    postMessage(msg: Message) {
        this.workerListeners[msg.type](this.listen, msg);
    }

    listen = (msg: Message) => {
        for (const listener of this.userListeners['message'].concat()) {
            listener({ data: msg });
        }
    };

    addEventListener(msg: string, listener: any) {
        this.userListeners[msg].push(listener);
    }

    removeEventListener(msg: string, listener: any) {
        const index = this.userListeners[msg].indexOf(listener);
        if (index >= 0) {
            this.userListeners[msg].splice(index, 1);
        }
    }

    listenerCount(msg: string) {
        return this.userListeners[msg].length;
    }

    terminate() {
        this.terminated = true;
    }
}

type Listen = (msg: Message) => void;
describe('BaseWorker', () => {
    it('should create workable handler', async () => {
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = new MWorker({
                start: (listen: Listen, msg: Message) => listen({ code: msg.code, type: 'start' }),
            });
        }

        const testWorker = new TestWorker();
        await testWorker.createHandler(
            { type: 'start' },
            {
                start: (acc, done) => done(),
            }
        );
    });

    it('should avoid conflict when running in parallel', async () => {
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = new MWorker({
                start: (listen: Listen, msg: Message) => {
                    setTimeout(
                        () => listen({ code: msg.code, type: 'start', payload: msg.payload }),
                        500
                    );
                },
            });
        }

        const testWorker = new TestWorker();
        const promises: Promise<any>[] = [];
        for (let i = 0; i < 20; i += 1) {
            promises.push(
                testWorker.createHandler(
                    { type: 'start', payload: i },
                    {
                        start: (data, done) => done(data),
                    }
                )
            );
        }

        const ans = await Promise.all(promises);
        for (let i = 0; i < 20; i += 1) {
            expect(ans[i]).toEqual(i);
        }
    });

    it('should reject promise when error happen', async () => {
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = new MWorker({
                start: (listen: Listen, msg: Message) =>
                    listen({ code: msg.code, type: 'error', payload: msg.payload }),
            });
        }

        const testWorker = new TestWorker();
        expect(
            await testWorker.createHandler({ type: 'start' }, {}).catch((_error) => {
                return 'error';
            })
        ).toBe('error');
    });

    it('should reject when timeout', async () => {
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = new MWorker({
                start: (listen: Listen, msg: Message) => {
                    setTimeout(
                        () => listen({ code: msg.code, type: 'error', payload: msg.payload }),
                        1000
                    );
                },
            });
        }

        const testWorker = new TestWorker();
        expect(
            await testWorker.createHandler({ type: 'start' }, {}, 100).catch((_error) => {
                return 'error';
            })
        ).toBe('error');
    });

    it('should remove the listener and timer after a timeout', async () => {
        let worker: MWorker;
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = (worker = new MWorker({
                start: () => undefined,
            }));
        }

        const testWorker = new TestWorker();
        await expect(testWorker.createHandler({ type: 'start' }, {}, 10)).rejects.toThrow(
            'Timeout 10 ms'
        );
        expect(worker!.listenerCount('message')).toBe(0);
    });

    it('should clean up when a response handler throws', async () => {
        let worker: MWorker;
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = (worker = new MWorker({
                start: (listen: Listen, msg: Message) => listen({ code: msg.code, type: 'start' }),
            }));
        }

        const testWorker = new TestWorker();
        await expect(
            testWorker.createHandler(
                { type: 'start' },
                {
                    start: () => {
                        throw new Error('handler failed');
                    },
                }
            )
        ).rejects.toThrow('handler failed');
        expect(worker!.listenerCount('message')).toBe(0);
    });

    it('should terminate an opted-in worker after it becomes idle', async () => {
        let worker: MWorker;
        class TestWorker extends BaseWorker {
            protected idleTimeout = 10;
            // @ts-ignore
            protected worker = (worker = new MWorker({
                start: (listen: Listen, msg: Message) => listen({ code: msg.code, type: 'start' }),
            }));
        }

        const testWorker = new TestWorker();
        await testWorker.createHandler(
            { type: 'start' },
            {
                start: (payload, done) => done(payload),
            }
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(worker!.terminated).toBe(true);
    });

    it('should reject and detach pending requests when destroyed', async () => {
        let worker: MWorker;
        class TestWorker extends BaseWorker {
            // @ts-ignore
            protected worker = (worker = new MWorker({
                start: () => undefined,
            }));
        }

        const testWorker = new TestWorker();
        const request = testWorker.createHandler({ type: 'start' }, {}, 1000);
        testWorker.destroy();
        await expect(request).rejects.toThrow('Worker was destroyed');
        expect(worker!.listenerCount('message')).toBe(0);
        expect(worker!.terminated).toBe(true);
    });
});
