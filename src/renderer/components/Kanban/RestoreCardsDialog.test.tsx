import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import { RestoreCardsDialog } from './RestoreCardsDialog';
import { feedback } from '../feedback';
import type { KanbanBoard, List } from './type';

jest.mock('../feedback', () => ({
    feedback: {
        toast: jest.fn(),
        alert: jest.fn(),
        confirm: jest.fn(),
        notice: jest.fn(),
        closeNotice: jest.fn(),
    },
}));

const moveCard = jest.fn();

const list = (id: string, title: string): List => ({ _id: id, title, cards: [] });

const boards: { [id: string]: KanbanBoard } = {
    b1: {
        _id: 'b1',
        name: 'Alpha',
        description: '',
        lists: ['l1'],
        focusedList: 'l1',
        doneList: '',
        relatedSessions: [],
        spentHours: 0,
    },
};

const makeStore = () =>
    createStore(
        (state: any) => state,
        {
            kanban: {
                boards,
                lists: { l1: list('l1', 'Todo') },
                cards: {},
            },
        } as any,
        applyMiddleware(thunk)
    );

const renderDialog = (cardIds: string[]) => {
    const onClose = jest.fn();
    const onRestored = jest.fn();
    render(
        <Provider store={makeStore()}>
            <RestoreCardsDialog open cardIds={cardIds} onClose={onClose} onRestored={onRestored} />
        </Provider>
    );
    return { onClose, onRestored };
};

const pickProjectAndRestore = async () => {
    fireEvent.click(screen.getByTitle('Alpha'));
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Restore$|^恢复$/ }));
    });
};

beforeEach(() => {
    moveCard.mockReset();
    moveCard.mockResolvedValue({ updatedCards: {}, updatedLists: {}, updatedBoards: {} });
    // Restoring goes through the real thunk; only the main-process command is
    // stubbed, so what this asserts is the IPC payload per card.
    (window as any).api = { ...(window as any).api, moveCardToBoard: moveCard };
    (feedback.toast as jest.Mock).mockClear();
    (feedback.alert as jest.Mock).mockClear();
});

describe('RestoreCardsDialog', () => {
    it('moves every selected card into the picked list', async () => {
        const { onClose, onRestored } = renderDialog(['c1', 'c2']);

        await pickProjectAndRestore();

        expect(moveCard.mock.calls).toEqual([
            [{ cardId: 'c1', targetListId: 'l1' }],
            [{ cardId: 'c2', targetListId: 'l1' }],
        ]);
        expect(feedback.toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
        expect(onRestored).toHaveBeenCalledWith(['c1', 'c2']);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('reports what was restored when the batch fails halfway', async () => {
        moveCard
            .mockResolvedValueOnce({ updatedCards: {}, updatedLists: {}, updatedBoards: {} })
            .mockRejectedValueOnce(new Error('list is gone'));
        const { onClose, onRestored } = renderDialog(['c1', 'c2', 'c3']);

        await pickProjectAndRestore();

        // The first card really moved before the failure; the caller has to
        // drop it from the dialog so it is not offered again.
        expect(onRestored).toHaveBeenCalledWith(['c1']);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(feedback.alert).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'error',
                content: expect.stringContaining('1 card were restored before the failure'),
            })
        );
    });
});
