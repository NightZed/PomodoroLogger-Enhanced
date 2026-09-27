/* istanbul ignore file */
import Worker from 'worker-loader!./trainKnn.worker';
import { PomodoroRecord } from '../monitor/type';
import { BaseWorker } from './BaseWorker';

export class KnnWorker extends BaseWorker {
    protected worker?: Worker;
    protected idleTimeout = 5 * 60 * 1000;
    private ready: boolean = false;
    constructor() {
        super();
    }

    async train(onDone: (accuracy: number) => void, onProgress: (progress: number) => void) {
        this.worker ??= new Worker();
        return this.createHandler(
            { type: 'trainModel' },
            {
                setProgress: onProgress,
                setAcc: (acc, done) => {
                    onDone(acc);
                    done();
                },
            },
            30000
        );
    }

    async test(onDone: (accuracy: number) => void, onProgress: (progress: number) => void) {
        this.worker ??= new Worker();
        return this.createHandler(
            { type: 'testModel' },
            {
                setProgress: onProgress,
                setAcc: (acc, done) => {
                    onDone(acc);
                    done();
                },
            },
            30000
        );
    }

    public async predict(record: PomodoroRecord | PomodoroRecord[]) {
        this.worker ??= new Worker();
        let records = record;
        if (!Array.isArray(record)) {
            records = [record];
        }

        return this.createHandler(
            { type: 'predict', payload: records },
            {
                predict: (payload, done) => {
                    if (!Array.isArray(record)) {
                        done(payload[0] as string);
                    } else {
                        done(payload as string[]);
                    }
                },
            }
        );
    }

    async loadModel(dbSize: number) {
        this.worker ??= new Worker();
        return this.createHandler(
            { type: 'loadModel', payload: { dbSize } },
            {
                onDone: (payload, done) => done(),
            }
        );
    }

    async saveModel() {
        this.worker ??= new Worker();
        return this.createHandler(
            { type: 'saveModel' },
            {
                onDone: (payload, done) => done(),
            }
        );
    }
}
