import * as React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import { rootReducer } from '../../reducers';
import { ListsCountBar } from './Bar';
import { applyKanbanSnapshot } from '../Kanban/snapshot';
import type { KanbanBoard, List } from '../Kanban/type';

const board: KanbanBoard = {
    _id: 'b1',
    name: 'Board',
    description: '',
    lists: ['l1', 'gone'],
    focusedList: 'l1',
    doneList: '',
    relatedSessions: [],
    spentHours: 0,
};

const list: List = { _id: 'l1', title: 'Todo', cards: ['c1', 'c2'] };

const mount = () => {
    const store = createStore(rootReducer, applyMiddleware(thunk));
    store.dispatch(applyKanbanSnapshot({ boards: { b1: board }, lists: { l1: list }, cards: {} }));
    return render(
        <Provider store={store}>
            <ListsCountBar boardId="b1" />
        </Provider>
    );
};

describe('ListsCountBar', () => {
    it('charts the lists the store still has', () => {
        const { container } = mount();

        expect(container.querySelectorAll('title')[0].textContent).toContain('2 cards');
    });

    it('skips a list the store does not have instead of crashing', () => {
        // Reading `.cards` off the missing list used to throw inside
        // `mapStateToProps`, which replaced the whole window with the crash
        // screen. That happened after "delete all data": the lists were
        // emptied before the boards were.
        expect(() => mount()).not.toThrow();
    });
});
