export interface Message {
    code?: number;
    type: string;
    payload?: any;
}

export abstract class BaseWorker {
    protected abstract worker?: Worker;
    protected idleTimeout?: number;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private activeRequests = 0;
    private pendingCancels = new Set<() => void>();

    async createHandler(
        postMsg: Message,
        msgHandler: { [type: string]: (payload: any, done: (v?: any) => void) => any },
        timeout: number | undefined = 10000
    ) {
        const worker = this.worker;
        if (!worker) {
            return Promise.reject(new Error('Worker is not available'));
        }

        // Use code to avoid conflict
        const _code = Math.random();
        postMsg.code = _code;
        this.clearIdleTimer();
        this.activeRequests += 1;

        return new Promise((resolve, reject) => {
            let isDone = false;
            let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
            function cancel() {
                finishReject(new Error('Worker was destroyed'));
            }
            const listener = ({
                data: { type, payload, code },
            }: {
                data: { type: string; payload: any; code: number };
            }) => {
                if (code !== _code) {
                    return;
                }

                if (!(type in msgHandler)) {
                    if (type === 'error') {
                        finishReject(payload);
                    }

                    return;
                }

                try {
                    Promise.resolve(msgHandler[type](payload, done)).catch(finishReject);
                } catch (error) {
                    finishReject(error);
                }
            };

            const cleanup = () => {
                if (isDone) {
                    return;
                }

                isDone = true;
                worker.removeEventListener('message', listener);
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
                this.pendingCancels.delete(cancel);
                this.activeRequests -= 1;
                this.scheduleIdleShutdown();
            };

            const done = (value?: any) => {
                cleanup();
                resolve(value);
            };

            const finishReject = (error: any) => {
                cleanup();
                reject(error);
            };
            this.pendingCancels.add(cancel);

            worker.addEventListener('message', listener);
            if (timeout !== undefined) {
                timeoutTimer = setTimeout(() => {
                    if (isDone) return;
                    finishReject(
                        new Error(`Timeout ${timeout} ms after message ${JSON.stringify(postMsg)}`)
                    );
                }, timeout);
            }

            try {
                worker.postMessage(postMsg);
            } catch (error) {
                finishReject(error);
                return;
            }
        });
    }

    destroy() {
        this.clearIdleTimer();
        for (const cancel of this.pendingCancels) {
            cancel();
        }
        this.pendingCancels.clear();
        const worker = this.worker;
        this.worker = undefined;
        worker?.terminate();
    }

    private clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    private scheduleIdleShutdown() {
        if (
            this.idleTimeout === undefined ||
            this.activeRequests !== 0 ||
            this.idleTimer !== undefined
        ) {
            return;
        }

        this.idleTimer = setTimeout(() => {
            this.idleTimer = undefined;
            if (this.activeRequests === 0) {
                this.destroy();
            }
        }, this.idleTimeout);
    }
}
