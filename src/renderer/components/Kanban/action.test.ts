import { actions, reducer, KanbanState } from './action';
import { Dispatch } from 'redux';
import dbs from '../../dbs';
import { AsyncDB } from '../../../utils/dbHelper';

const settingDB = new AsyncDB(dbs.settingDB);

beforeEach(async () => {
    // reset settings document in-memory (and on disk) before each test
    await settingDB.remove({}, { multi: true });
});

describe('kanban sort preference', () => {
    let state: KanbanState;
    // @ts-ignore
    const dispatch: Dispatch = (action: any) => {
        try {
            state = reducer(state, action);
        } catch (e) {
            console.warn(e);
        }
    };

    beforeEach(() => {
        // each test starts from a fresh reducer state (like an app restart)
        state = reducer(undefined as any, { type: '@@INIT' });
    });

    it('persists sortedBy to settingDB and restores it after restart', async () => {
        await actions.setSortedBy('alpha')(dispatch);
        expect(state.sortedBy).toBe('alpha');
        const setting = await settingDB.findOne({ name: 'setting' });
        expect(setting.sortedBy).toBe('alpha');

        // simulate app restart: the reducer starts from a fresh default state
        state = undefined as any;
        await actions.fetchSortedBy()(dispatch);
        expect(state.sortedBy).toBe('alpha');
    });

    it('ignores invalid persisted sortedBy', async () => {
        await settingDB.insert({ name: 'setting', sortedBy: 'illegal-sort' });
        await actions.fetchSortedBy()(dispatch);
        expect(state.sortedBy).toBe('recent');
    });
});
