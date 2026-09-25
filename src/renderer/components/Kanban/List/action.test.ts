import { actions, listReducer } from './action';
import shortid from 'shortid';
import { AsyncDB } from '../../../../utils/dbHelper';
import dbs from '../../../dbs';
import { generateRandomName } from '../../../utils';
import { Dispatch } from 'redux';
import { List, ListsState } from '../type';

jest.setTimeout(30000);
// The old `beforeEach` unlinked the db file and called `refreshDbs()`. That was
// both pointless and the source of the parallel-run flake: `refreshDbs()` swaps
// in brand-new nedb instances, but this file's `AsyncDB` handles and the
// `FakeDBWorker` instances behind `workers.dbWorkers` captured the *original*
// instances at import time, so they never saw the replacement. All it did was
// delete the file out from under the still-open original instance's persistence
// handle — under 19 concurrent Jest workers that wedged nedb's async write
// queue and every later op on the stuck db hung until the 30s test timeout.
// Clearing the tables in place gives the same fresh-database semantics with no
// file churn.
const db = new AsyncDB(dbs.listsDB);
const moveDB = new AsyncDB(dbs.moveDB);
const kanbanDB = new AsyncDB(dbs.kanbanDB);
const cardsDB = new AsyncDB(dbs.cardsDB);
beforeEach(async () => {
    await Promise.all([
        db.remove({}, { multi: true }),
        cardsDB.remove({}, { multi: true }),
        kanbanDB.remove({}, { multi: true }),
        moveDB.remove({}, { multi: true }),
    ]);
});

async function addList(_id: string, dispatch = jest.fn()) {
    await actions.addList(_id, _id)(dispatch);
    return dispatch;
}

async function addCard(_id: string, cardId: string, dispatch = jest.fn()) {
    await actions.addCardById(_id, cardId)(dispatch);
    return dispatch;
}

async function moveCardSetup(dispatch: any = undefined) {
    const _id0 = shortid.generate();
    const _id1 = shortid.generate();
    await addList(_id0, dispatch);
    await addList(_id1, dispatch);
    await addCard(_id0, '0', dispatch);
    await addCard(_id0, '1', dispatch);
    await addCard(_id0, '2', dispatch);

    await addCard(_id1, '10', dispatch);
    await addCard(_id1, '11', dispatch);
    await addCard(_id1, '12', dispatch);
    return [_id0, _id1];
}

describe('listActions', () => {
    it('add list', async () => {
        const _id = shortid.generate();
        const dis = await addList(_id);
        expect(dis.mock.calls[0][0]).toStrictEqual({
            type: '[List]ADD',
            payload: {
                _id,
                title: _id,
            },
        });

        const docs: List[] = await db.find({}, {});
        expect(docs[0]._id).toBe(_id);
    });

    it('add card', async () => {
        const _id = generateRandomName();
        await addList(_id);
        const dispatch = await addCard(_id, 'cardId');
        expect(dispatch.mock.calls[0][0]).toStrictEqual({
            type: '[List]ADD_CARD',
            payload: {
                _id,
                cardId: 'cardId',
            },
        });

        const doc: List = await db.findOne({ _id });
        expect(doc.cards).toStrictEqual(['cardId']);
    });

    it('moveCard 0', async () => {
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            state = listReducer(state, action);
        };
        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.moveCard(_id0, _id1, 0, 2)(dispatch);
        const doc0: List = await db.findOne({ _id: _id0 });
        expect(doc0.cards).toStrictEqual(['1', '2']);
        const doc1: List = await db.findOne({ _id: _id1 });
        expect(doc1.cards).toStrictEqual(['10', '11', '0', '12']);
    });

    it('moveCard 1', async () => {
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            state = listReducer(state, action);
        };
        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.moveCard(_id0, _id1, 0, 0)(dispatch);
        const doc0: List = await db.findOne({ _id: _id0 });
        expect(doc0.cards).toStrictEqual(['1', '2']);
        const doc1: List = await db.findOne({ _id: _id1 });
        expect(doc1.cards).toStrictEqual(['0', '10', '11', '12']);
    });

    it('moveCard 2', async () => {
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            state = listReducer(state, action);
        };
        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.moveCard(_id0, _id0, 0, 2)(dispatch);
        const doc0: List = await db.findOne({ _id: _id0 });
        expect(doc0.cards).toStrictEqual(['1', '2', '0']);
        const doc1: List = await db.findOne({ _id: _id1 });
        expect(doc1.cards).toStrictEqual(['10', '11', '12']);
    });

    it('moveCard by visibleCard state', async () => {
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            state = listReducer(state, action);
        };
        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.setVisibleCards(_id0, ['2'])(dispatch);
        await actions.moveCard(_id0, _id1, 0, 0)(dispatch);
        const doc0: List = await db.findOne({ _id: _id0 });
        expect(doc0.cards).toStrictEqual(['0', '1']);
        const doc1: List = await db.findOne({ _id: _id1 });
        expect(doc1.cards).toStrictEqual(['2', '10', '11', '12']);
        await actions.setVisibleCards(_id1, ['10', '11'])(dispatch);
        await actions.moveCard(_id1, _id0, 0, 0)(dispatch);
        {
            const doc0: List = await db.findOne({ _id: _id0 });
            expect(doc0.cards).toStrictEqual(['10', '0', '1']);
            const doc1: List = await db.findOne({ _id: _id1 });
            expect(doc1.cards).toStrictEqual(['2', '11', '12']);
        }
    });

    it('moveCard by visibleCard state even when moving in the same list', async () => {
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            state = listReducer(state, action);
        };
        const [_id0, _id1] = await moveCardSetup(dispatch);
        await addCard(_id0, '3', dispatch);
        await addCard(_id0, '4', dispatch);
        await addCard(_id0, '5', dispatch);
        await addCard(_id0, '6', dispatch);
        await actions.setVisibleCards(_id0, ['2', '4', '6'])(dispatch);
        await actions.moveCard(_id0, _id0, 0, 1)(dispatch);
        {
            const doc0: List = await db.findOne({ _id: _id0 });
            expect(doc0.cards).toStrictEqual(['0', '1', '3', '4', '2', '5', '6']);
        }
        await actions.setVisibleCards(_id0, ['4', '2', '6'])(dispatch);
        await actions.moveCard(_id0, _id0, 0, 2)(dispatch);
        {
            const doc0: List = await db.findOne({ _id: _id0 });
            expect(doc0.cards).toStrictEqual(['0', '1', '3', '2', '5', '6', '4']);
        }
    });
});

describe('listReducer', () => {
    it('should move item', async () => {
        let state: ListsState = {};

        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            try {
                state = listReducer(state, action);
            } catch (e) {}
        };

        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.moveCard(_id0, _id0, 0, 2)(dispatch);
        expect(state[_id0].cards).toStrictEqual(['1', '2', '0']);
        expect(state[_id1].cards).toStrictEqual(['10', '11', '12']);

        // test delete card
        const cardId = state[_id1].cards[0];
        await actions.deleteCard(_id1, cardId)(dispatch);
        expect(state[_id1].cards.every((v) => v !== cardId)).toBeTruthy();

        // test delete list
        await actions.deleteList(_id0)(dispatch);
        expect(state[_id0]).toBeUndefined();

        // TODO
        // // test fetch & save
        // const oldState = Object.assign(state, {});
        // state = {};
        // await actions.fetchLists()(dispatch);
        // expect(state).toStrictEqual(oldState);
    });

    it('should update', async () => {
        let state: ListsState = {};
        // A test function may either take `done` or return a promise, never both
        // (jest 30 rejects the combination), so the card callback is recorded here.
        let cardAdded = false;

        // @ts-ignore
        const dispatch: Dispatch = (action: any) => {
            if (action.type.startsWith('[Card]')) {
                if (action.payload.title === 'newcardid') {
                    cardAdded = true;
                    return;
                }
            }

            try {
                state = listReducer(state, action);
            } catch (e) {}
        };

        const [_id0, _id1] = await moveCardSetup(dispatch);
        await actions.moveCard(_id0, _id1, 0, 2)(dispatch);
        expect(state[_id0].cards).toStrictEqual(['1', '2']);
        expect(state[_id1].cards).toStrictEqual(['10', '11', '0', '12']);

        await actions.renameList(_id0, 'id011')(dispatch);
        expect(state[_id0].title).toBe('id011');
        await actions.addCard(_id0, 'newcardid')(dispatch);
        expect(cardAdded).toBe(true);
    });

    it('stamps completedTime only when a card lands in the board done list', async () => {
        const todoId = shortid.generate();
        const plainId = shortid.generate();
        const doneId = shortid.generate();

        // setup must go through the reducer so the moveCard handlers can read
        // the lists from the state
        let state: ListsState = {};
        const dispatch: any = (action: any) => {
            try {
                state = listReducer(state, action);
            } catch (e) {}
        };

        await actions.addList(todoId, todoId)(dispatch);
        await actions.addList(plainId, plainId)(dispatch);
        await actions.addList(doneId, doneId)(dispatch);
        await actions.addCard(todoId, 'finish me')(dispatch);
        const todo: List = await db.findOne({ _id: todoId });
        const cardId = todo.cards[0];
        await kanbanDB.insert({
            _id: 'board',
            name: 'board',
            description: '',
            lists: [todoId, plainId, doneId],
            focusedList: todoId,
            doneList: doneId,
            relatedSessions: [],
            spentHours: 0,
        });

        // a plain list is not a done list: no stamp
        await actions.moveCard(todoId, plainId, 0, 0)(dispatch);
        expect((await cardsDB.findOne({ _id: cardId })).completedTime).toBeUndefined();

        // landing in the done list stamps the completion time
        await actions.moveCard(plainId, doneId, 0, 0)(dispatch);
        const stamped = await cardsDB.findOne({ _id: cardId });
        expect(typeof stamped.completedTime).toBe('number');

        // moving around inside the done list does not re-stamp
        const stampedTime = stamped.completedTime;
        await actions.moveCard(doneId, doneId, 0, 0)(dispatch);
        expect((await cardsDB.findOne({ _id: cardId })).completedTime).toBe(stampedTime);
    });
});
