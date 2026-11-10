/**
 * Regression: closing the editor must not blank the card it is still showing.
 *
 * The dialog is force-rendered, so it stays on screen while the close motion
 * runs. The close action used to clear `editCard._id`, which made `card`
 * undefined in the first closing render: the "Created: ..." line (gated on
 * `card`) vanished while closing, the dialog shrank before it disappeared, and
 * `isCreating` flipped so a re-render during the close swapped in the create
 * layout. Closing now keeps `_id`/`listId`; only `isEditing` changes.
 */
import * as React from 'react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { rootReducer } from '../../../reducers';
import { POPUP_CONTAINER_ID } from '../../popupLayer';
import { feedback } from '../../feedback';
import { actions } from '../action';
import { CardInDetail } from './CardEditor';

jest.mock('../../feedback', () => ({
    ...jest.requireActual('../../feedback'),
    feedback: { confirm: jest.fn(), toast: jest.fn() },
}));

const CARD = {
    _id: 'card-1',
    title: 'T',
    content: 'C',
    createdTime: 1600000000000,
    sessionIds: [],
    spentTimeInHour: { estimated: 1, actual: 0 },
};

const preloadedState = {
    kanban: {
        boards: {
            'board-1': {
                _id: 'board-1',
                lists: ['list-1'],
                doneList: 'done-list',
            },
        },
        lists: {
            'list-1': { _id: 'list-1', cards: ['card-1'] },
        },
        cards: { 'card-1': CARD },
        kanban: {
            isSearching: false,
            sortedBy: 'recent',
            sortDirection: 'asc',
            editCard: { isEditing: false, listId: '' },
        },
    },
};

describe('CardEditor close', () => {
    let store: any;

    beforeEach(() => {
        const popupLayer = document.createElement('div');
        popupLayer.id = POPUP_CONTAINER_ID;
        document.body.appendChild(popupLayer);

        // The auto-sizing textarea reports NaN heights in jsdom; antd logs it.
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        store = createStore(rootReducer, preloadedState as any, applyMiddleware(thunk));

        render(
            <Provider store={store}>
                <CardInDetail />
            </Provider>
        );
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        (console.error as jest.Mock).mockRestore();
        (console.warn as jest.Mock).mockRestore();
    });

    const modalText = () => document.querySelector('.ant-modal')?.textContent ?? '';

    it('keeps the card rendered while the dialog closes', async () => {
        await act(async () => {
            store.dispatch(actions.setEditCard(true, 'list-1', 'card-1') as any);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(modalText()).toContain('Created:');

        const close = document.querySelector('.ant-modal-close') as HTMLElement;
        expect(close).not.toBeNull();
        await act(async () => {
            fireEvent.click(close);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // Closed, but the id is still there for the closing frames...
        expect(store.getState().kanban.kanban.editCard).toEqual({
            isEditing: false,
            _id: 'card-1',
            listId: 'list-1',
        });
        // ...so the still-mounted dialog keeps showing the edited card instead
        // of collapsing into the create layout.
        expect(modalText()).toContain('Created:');
        expect(modalText()).toContain('Actual Spent Time');
        expect(modalText()).not.toContain('Create a new card');
    });
});

describe('CardEditor delete', () => {
    let store: any;

    beforeEach(() => {
        const popupLayer = document.createElement('div');
        popupLayer.id = POPUP_CONTAINER_ID;
        document.body.appendChild(popupLayer);

        // The auto-sizing textarea reports NaN heights in jsdom; antd logs it.
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        store = createStore(rootReducer, preloadedState as any, applyMiddleware(thunk));

        render(
            <Provider store={store}>
                <CardInDetail />
            </Provider>
        );
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        (console.error as jest.Mock).mockRestore();
        (console.warn as jest.Mock).mockRestore();
        jest.clearAllMocks();
    });

    it('names the card in a modal confirm and deletes only after it is accepted', async () => {
        await act(async () => {
            store.dispatch(actions.setEditCard(true, 'list-1', 'card-1') as any);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const deleteButton = Array.from(document.querySelectorAll('.ant-modal button')).find(
            (button) => button.textContent?.trim() === 'Delete'
        );
        expect(deleteButton).toBeDefined();

        await act(async () => {
            fireEvent.click(deleteButton!);
        });

        expect(feedback.confirm).toHaveBeenCalledTimes(1);
        expect(feedback.confirm).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining(CARD.title) })
        );
        expect(store.getState().kanban.cards['card-1']).toBeDefined();

        const { onOk } = (feedback.confirm as jest.Mock).mock.calls[0][0];
        await act(async () => {
            onOk();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(store.getState().kanban.cards['card-1']).toBeUndefined();
    });
});
