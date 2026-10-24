import { PomodoroRecord } from '../monitor/type';
import { KNN } from '../../main/learner/appKnn';
import type { KnnModel } from '../../main/learner/appKnn';
import { sample } from '../../utils/random';

const ctx: Worker = self as any;

let knn = new KNN();
async function train(isTest: boolean, code: number, records: PomodoroRecord[]) {
    try {
        records = records.filter((r) => r.boardId !== undefined);
        if (records.length === 0) {
            ctx.postMessage({
                code,
                type: 'error',
                payload: 'Training array is empty',
            });
            return;
        }

        let train;
        let test;
        if (isTest) {
            [train, test] = sample(records, 0.5);
        } else {
            [train, test] = sample(records, 1);
        }

        ctx.postMessage({
            code,
            type: 'setProgress',
            payload: 20,
        });
        knn.fit(train);
        ctx.postMessage({
            code,
            type: 'setProgress',
            payload: 80,
        });
        const preds = knn.predict(test);
        let t = 0;
        let f = 0;
        for (let i = 0; i < test.length; i += 1) {
            const pred = preds[i];
            const ans = test[i].projectId;
            if (pred === ans) {
                t += 1;
            } else {
                f += 1;
            }
        }

        ctx.postMessage({
            code,
            type: 'setAcc',
            payload: t / (t + f),
        });
        ctx.postMessage({
            code,
            type: 'setProgress',
            payload: 100,
        });
    } catch (e) {
        console.error(e);
        ctx.postMessage({
            code,
            type: 'error',
            payload: (e as Error).toString(),
        });
    }
}

function saveModel(code: number) {
    try {
        // Persistence belongs to the main process; the worker only serializes
        // the model it already holds.
        ctx.postMessage({
            code,
            type: 'saved',
            payload: knn.toJson(),
        });
    } catch (e) {
        ctx.postMessage({
            code,
            type: 'error',
            payload: e,
        });
    }
}

async function loadModel(
    dbSize: number,
    code: number,
    records: PomodoroRecord[],
    model: KnnModel | undefined
) {
    knn = model ? KNN.fromJson(model) : new KNN();
    let retrained = !model;

    if (!knn.isTrained || dbSize - knn.length > 20 || dbSize / knn.length > 1.5) {
        retrained = true;
        await train(false, code, records);
    }

    ctx.postMessage({
        code,
        type: 'loaded',
        payload: {
            model: knn.toJson(),
            // Only write when there was nothing usable: an unchanged model is
            // read and used without touching the disk again.
            save: retrained,
        },
    });
}

function predict(payload: PomodoroRecord[], code: number) {
    const record = payload as PomodoroRecord[];
    const ans = knn.predict(record);
    ctx.postMessage({
        code,
        type: 'predict',
        payload: ans,
    });
}

ctx.addEventListener('message', async ({ data: { type, payload, code } }) => {
    try {
        if (type === 'trainModel') {
            knn = new KNN();
            await train(false, code, payload.records);
        } else if (type === 'testModel') {
            knn = new KNN();
            await train(true, code, payload.records);
        } else if (type === 'saveModel') {
            saveModel(code);
        } else if (type === 'loadModel') {
            await loadModel(payload.dbSize, code, payload.records, payload.model);
        } else if (type === 'predict') {
            predict(payload, code);
        }
    } catch (e) {
        console.error(e);
        ctx.postMessage({
            code,
            type: 'error',
            payload: JSON.stringify(e),
        });
    }
});
