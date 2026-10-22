/* istanbul ignore file */
import { PomodoroRecord } from '../monitor/type';
import { BaseWorker } from './BaseWorker';
import { Card } from '../components/Kanban/type';
import { createTokenizerWorker } from './nativeWorkerFactory';

export class Tokenizer extends BaseWorker {
    protected worker?: Worker;
    protected idleTimeout = 5 * 60 * 1000;

    public async tokenize(records: PomodoroRecord[], cards: Card[]): Promise<[string, number][]> {
        if (process.env.NODE_ENV === 'test') {
            return [];
        }

        this.worker ??= createTokenizerWorker();
        return (await this.createHandler(
            {
                type: 'tokenize',
                payload: {
                    records,
                    cards,
                },
            },
            {
                tokenize: (payload, done) => {
                    done(payload);
                },
            },
            5000
        )) as [string, number][];
    }
}
