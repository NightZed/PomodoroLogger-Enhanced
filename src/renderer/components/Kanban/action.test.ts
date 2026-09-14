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
        await actions.fetchSortState()(dispatch);
        expect(state.sortedBy).toBe('alpha');
    });

    it('persists sortDirection to settingDB and restores it after restart', async () => {
        await actions.setSortDirection('desc')(dispatch);
        expect(state.sortDirection).toBe('desc');
        const setting = await settingDB.findOne({ name: 'setting' });
        expect(setting.sortDirection).toBe('desc');

        // simulate app restart: the reducer starts from a fresh default state
        state = undefined as any;
        await actions.fetchSortState()(dispatch);
        expect(state.sortDirection).toBe('desc');
        expect(state.sortedBy).toBe('recent');
    });

    it('persists sortedBy and sortDirection together and restores both', async () => {
        await actions.setSortedBy('created')(dispatch);
        await actions.setSortDirection('desc')(dispatch);

        state = undefined as any;
        await actions.fetchSortState()(dispatch);
        expect(state.sortedBy).toBe('created');
        expect(state.sortDirection).toBe('desc');
    });

    it('ignores invalid persisted sortedBy', async () => {
        await settingDB.insert({ name: 'setting', sortedBy: 'illegal-sort' });
        await actions.fetchSortState()(dispatch);
        expect(state.sortedBy).toBe('recent');
    });

    it('ignores invalid persisted sortDirection', async () => {
        await settingDB.insert({ name: 'setting', sortDirection: 'illegal-direction' });
        await actions.fetchSortState()(dispatch);
        expect(state.sortDirection).toBe('asc');
    });
});
