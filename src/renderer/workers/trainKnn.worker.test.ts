jest.mock('../../utils/random', () => ({
    sample: jest.fn((records: any[]) => [records, records]),
}));

jest.mock('../../main/learner/appKnn', () => {
    const instance: any = {
        fit: jest.fn(),
        predict: jest.fn(() => []),
        toJson: jest.fn(() => ({ serialized: true })),
        isTrained: false,
        length: 0,
    };
    const KNN: any = jest.fn(() => instance);
    KNN.fromJson = jest.fn(() => instance);
    KNN.__instance = instance;
    return { KNN };
});

const { KNN } = require('../../main/learner/appKnn');
const knn = KNN.__instance;

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
        require('./trainKnn.worker');
    });

    (global as any).self = realSelf;

    return {
        postMessage,
        emit: async (data: any) => {
            await listeners[0]({ data });
        },
    };
}

describe('renderer/workers/trainKnn.worker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        knn.isTrained = false;
        knn.length = 0;
        knn.predict.mockReturnValue([]);
        knn.toJson.mockReturnValue({ serialized: true });
    });

    it('trains, reports progress and posts the accuracy', async () => {
        const worker = loadWorker();
        knn.predict.mockReturnValue(['project']);

        await worker.emit({
            code: 1,
            type: 'trainModel',
            payload: { records: [{ boardId: 'b1', projectId: 'project' }] },
        });

        expect(knn.fit).toHaveBeenCalledWith([{ boardId: 'b1', projectId: 'project' }]);
        expect(worker.postMessage.mock.calls.map((call) => call[0])).toEqual([
            { code: 1, type: 'setProgress', payload: 20 },
            { code: 1, type: 'setProgress', payload: 80 },
            { code: 1, type: 'setAcc', payload: 1 },
            { code: 1, type: 'setProgress', payload: 100 },
        ]);
    });

    it('refuses to train on records without a project', async () => {
        const worker = loadWorker();

        await worker.emit({
            code: 2,
            type: 'trainModel',
            payload: { records: [{ boardId: undefined }] },
        });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 2,
            type: 'error',
            payload: 'Training array is empty',
        });
        expect(knn.fit).not.toHaveBeenCalled();
    });

    it('evaluates a test model on a sample of the records', async () => {
        const worker = loadWorker();
        knn.predict.mockReturnValue(['wrong']);

        await worker.emit({
            code: 4,
            type: 'testModel',
            payload: { records: [{ boardId: 'b1', projectId: 'right' }] },
        });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 4,
            type: 'setAcc',
            payload: 0,
        });
    });

    it('serializes the current model on save', async () => {
        const worker = loadWorker();

        await worker.emit({ code: 5, type: 'saveModel' });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 5,
            type: 'saved',
            payload: { serialized: true },
        });
    });

    it('loads a usable model without retraining it', async () => {
        knn.isTrained = true;
        knn.length = 10;
        const worker = loadWorker();
        const fromJson = KNN.fromJson;
        fromJson.mockReturnValue(knn);

        await worker.emit({
            code: 6,
            type: 'loadModel',
            payload: { dbSize: 12, records: [], model: { any: true } },
        });

        expect(fromJson).toHaveBeenCalledWith({ any: true });
        expect(knn.fit).not.toHaveBeenCalled();
        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 6,
            type: 'loaded',
            payload: { model: { serialized: true }, save: false },
        });
    });

    it('retrains when the stored model is too old for the database', async () => {
        knn.isTrained = true;
        knn.length = 1;
        const worker = loadWorker();
        KNN.fromJson.mockReturnValue(knn);

        await worker.emit({
            code: 7,
            type: 'loadModel',
            payload: {
                dbSize: 100,
                records: [{ boardId: 'b1', projectId: 'p' }],
                model: { any: true },
            },
        });

        expect(knn.fit).toHaveBeenCalled();
        expect(worker.postMessage).toHaveBeenLastCalledWith({
            code: 7,
            type: 'loaded',
            payload: { model: { serialized: true }, save: true },
        });
    });

    it('predicts for the current model', async () => {
        const worker = loadWorker();
        knn.predict.mockReturnValue(['board']);

        await worker.emit({ code: 8, type: 'predict', payload: [{ boardId: 'b1' }] });

        expect(knn.predict).toHaveBeenCalledWith([{ boardId: 'b1' }]);
        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 8,
            type: 'predict',
            payload: ['board'],
        });
    });

    it('reports unexpected failures instead of hanging the caller', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const worker = loadWorker();
        knn.predict.mockImplementation(() => {
            throw new Error('broken model');
        });

        await worker.emit({ code: 9, type: 'predict', payload: [] });

        expect(worker.postMessage).toHaveBeenCalledWith({
            code: 9,
            type: 'error',
            payload: expect.any(String),
        });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
