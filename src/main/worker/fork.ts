import path from 'path';
import { fork } from 'child_process';
import { WorkerMessage, WorkerMessageType, WorkerResponse } from '../ipc/type';

interface PendingRequest {
    resolve: (data: WorkerResponse<any>) => void;
    reject: (err: any) => void;
    // `ReturnType<typeof setTimeout>` works with every @types/node version;
    // `NodeJS.Timer` no longer matches the `clearTimeout` overloads of node 22.
    timeout: ReturnType<typeof setTimeout>;
}

let workerProcess: ReturnType<typeof fork> | undefined;
const pendingMap: { [id: string]: PendingRequest } = {};
let idleTimer: ReturnType<typeof setTimeout> | undefined;
/** Set by `releaseWorkerNow`; the next moment the child goes idle, it is killed. */
let releaseWhenIdle = false;

// 惰性创建 worker 进程：只有首次发送消息时才 fork，
// 避免应用启动阶段就无条件多驻留一个完整的 Node 进程。
function ensureWorker() {
    if (!workerProcess) {
        // `advanced` switches channel serialization from JSON to V8's
        // structured clone: ImportData ships the whole database through here,
        // and JSON.stringify of that payload held the main process's single
        // thread for seconds before the merge even started.
        workerProcess = fork(path.join(__dirname, 'worker.js'), {
            serialization: 'advanced',
        });
        workerProcess.on('message', (msg: WorkerResponse) => {
            if (!msg.id) {
                return;
            }

            const pending = pendingMap[msg.id];
            if (!pending) {
                return;
            }

            clearTimeout(pending.timeout);
            delete pendingMap[msg.id];
            scheduleIdleShutdown();
            if (msg.error) {
                pending.reject(new Error(msg.error));
            } else {
                pending.resolve(msg);
            }
            stopWorkerIfReleased();
        });
        workerProcess.on('exit', () => {
            workerProcess = undefined;
            releaseWhenIdle = false;
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = undefined;
            }
            const pendings = pendingMap;
            for (const id in pendings) {
                const pending = pendings[id];
                clearTimeout(pending.timeout);
                delete pendingMap[id];
                pending.reject(new Error('Worker process exited before reply'));
            }
        });
    }

    return workerProcess;
}

// 空闲回收：worker 长时间无任务时将其终止，进一步降低常驻内存。
// History aggregation can retain a large year of parsed records, so release the
// child sooner than the old five-minute default; a new query spawns it again.
function scheduleIdleShutdown() {
    if (idleTimer) {
        clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(stopWorker, 60 * 1000);
}

function stopWorker() {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
    }

    if (workerProcess) {
        try {
            workerProcess.kill();
        } catch (e) {
            // kill may not be available in some runtime
        }
    }
}

/**
 * Kill the aggregation child as soon as it has nothing in flight.
 *
 * `scheduleIdleShutdown` waits 60s after the last reply, which is the right
 * trade while the window is in use: the next query reuses the process. Once the
 * window is out of sight nobody will ask again for a while, and the child is
 * still holding the year of records it just aggregated, so the wait buys
 * nothing. A request already running is left to finish -- its reply is still
 * wanted, and killing it would only surface as a rejected promise in the page;
 * the child goes the moment that reply lands.
 */
export function releaseWorkerNow(): void {
    if (!workerProcess) {
        return;
    }

    releaseWhenIdle = true;
    stopWorkerIfReleased();
}

function stopWorkerIfReleased(): void {
    if (!releaseWhenIdle || !workerProcess) {
        return;
    }

    if (Object.keys(pendingMap).length > 0) {
        return;
    }

    releaseWhenIdle = false;
    stopWorker();
}

export function sendWorkerMessage<T extends WorkerMessageType>(
    msg: WorkerMessage<T>,
    timeout: number = 60 * 1000
): Promise<WorkerResponse<T>> {
    const worker = ensureWorker();
    const id = msg.id ?? Math.random();
    msg.id = id;
    scheduleIdleShutdown();

    return new Promise((resolve, reject) => {
        const timeoutTimer = setTimeout(() => {
            if (pendingMap[id]) {
                delete pendingMap[id];
                reject(new Error(`Worker request timeout after ${timeout} ms`));
            }
        }, timeout);

        pendingMap[id] = {
            resolve,
            reject,
            timeout: timeoutTimer,
        };

        worker.send(msg);
    });
}
