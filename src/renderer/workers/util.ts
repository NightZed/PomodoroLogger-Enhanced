export type DoneType = (data: { payload: any; type: string }) => void;

export function addWorkerListeners(
    ctx: Worker,
    handleMap: { [type: string]: (payload: any, done: DoneType) => void }
) {
    ctx.addEventListener('message', async ({ data: { type, payload, code } }) => {
        if (!(type in handleMap)) {
            return;
        }

        const done = (data: { payload: any; type: string }) => {
            // @ts-ignore
            data.code = code;
            ctx.postMessage(data);
        };

        try {
            await handleMap[type](payload, done);
        } catch (e) {
            // Report back with the request code so the pending promise in
            // BaseWorker rejects instead of waiting for its timeout.
            console.error(`[worker] ${type} failed`, e);
            ctx.postMessage({
                code,
                type: 'error',
                payload: String(e),
            });
        }
    });
}
