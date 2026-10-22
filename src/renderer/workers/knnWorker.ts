/* istanbul ignore file */
import { PomodoroRecord } from '../monitor/type';
import { BaseWorker } from './BaseWorker';
import { dbs } from '../dbs';
import { createKnnWorker } from './nativeWorkerFactory';

export class KnnWorker extends BaseWorker {
    protected worker?: Worker;
    protected idleTimeout = 5 * 60 * 1000;
    private ready: boolean = false;
    constructor() {
        super();
    }

    /**
     * The KNN worker used to open the session database file itself. Now that
     * the main process owns SQLite, the renderer reads the records through the
     * repository and sends them with the request.
     */
    private async getRecords(): Promise<PomodoroRecord[]> {
        return dbs.sessionDB.find({}, { apps: 1, boardId: 1 });
    }

    async train(onDone: (accuracy: number) => void, onProgress: (progress: number) => void) {
        this.worker ??= createKnnWorker();
        const records = await this.getRecords();
        return this.createHandler(
            { type: 'trainModel', payload: { records } },
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
        this.worker ??= createKnnWorker();
        const records = await this.getRecords();
        return this.createHandler(
            { type: 'testModel', payload: { records } },
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
        this.worker ??= createKnnWorker();
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
        this.worker ??= createKnnWorker();
        const records = await this.getRecords();
        return this.createHandler(
            { type: 'loadModel', payload: { dbSize, records } },
            {
                onDone: (payload, done) => done(),
            },
            // Loading (and possibly retraining, which reads the whole session
            // DB) outlasts the 10s default. Without a real budget the request
            // timed out while the worker kept training for nobody, which burned
            // CPU on every start.
            60000
        );
    }

    async saveModel() {
        this.worker ??= createKnnWorker();
        return this.createHandler(
            { type: 'saveModel' },
            {
                onDone: (payload, done) => done(),
            }
        );
    }
}
