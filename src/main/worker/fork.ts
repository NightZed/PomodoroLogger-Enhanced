import path from 'path';
import { fork } from 'child_process';
import { WorkerMessage, WorkerMessageType, WorkerResponse } from '../ipc/type';

interface PendingRequest {
    resolve: (data: WorkerResponse<any>) => void;
    reject: (err: any) => void;
    timeout: NodeJS.Timer;
}

let workerProcess: ReturnType<typeof fork> | undefined;
const pendingMap: { [id: string]: PendingRequest } = {};
let idleTimer: NodeJS.Timer | undefined;

// 惰性创建 worker 进程：只有首次发送消息时才 fork，
// 避免应用启动阶段就无条件多驻留一个完整的 Node 进程。
function ensureWorker() {
    if (!workerProcess) {
        workerProcess = fork(path.join(__dirname, 'worker.js'));
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
            pending.resolve(msg);
        });
        workerProcess.on('exit', () => {
            workerProcess = undefined;
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
function scheduleIdleShutdown() {
    if (idleTimer) {
        clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(() => {
        idleTimer = undefined;
        if (workerProcess) {
            try {
                workerProcess.kill();
            } catch (e) {
                // kill may not be available in some runtime
            }
        }
    }, 5 * 60 * 1000);
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
