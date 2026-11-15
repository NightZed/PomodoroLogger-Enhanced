// Guards the spec semantics of the jsdom MessageChannel polyfill
// (test/setup-env.js). An earlier draft of it delivered each port's messages
// back to itself and lacked `close()`: the renderer's timer-free macrotask
// waits (src/renderer/components/Timer/wait.ts) need cross-pair delivery --
// `port2.postMessage` must wake `port1.onmessage` -- and hang on their first
// await under a self-delivering stub.
describe('MessageChannel polyfill (setup-env.js)', () => {
    it('delivers port2.postMessage to port1.onmessage asynchronously', async () => {
        const { port1, port2 } = new MessageChannel();
        const received: unknown[] = [];
        port1.onmessage = (event: { data: unknown }) => {
            received.push(event.data);
        };
        port2.postMessage('ping');

        // Delivery is asynchronous: nothing has arrived within the same task.
        expect(received).toEqual([]);

        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(received).toEqual(['ping']);
    });

    it('queues messages posted before start() and releases them on start', async () => {
        const { port1, port2 } = new MessageChannel();
        const received: unknown[] = [];
        port2.postMessage('early');

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(received).toEqual([]);

        port1.onmessage = (event: { data: unknown }) => {
            received.push(event.data);
        };
        port1.start();

        expect(received).toEqual(['early']);
    });

    it('does not throw on close', () => {
        const { port1, port2 } = new MessageChannel();

        expect(() => {
            port1.close();
            port2.close();
        }).not.toThrow();
    });
});
