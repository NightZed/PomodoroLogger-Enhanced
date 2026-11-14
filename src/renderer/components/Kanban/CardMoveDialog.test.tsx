import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import { CardMoveDialog } from './CardMoveDialog';
import { feedback } from '../feedback';
import type { Card, KanbanBoard, List } from './type';

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

const list = (id: string, title: string, cards: string[]): List => ({ _id: id, title, cards });

const card: Card = {
    _id: 'c1',
    title: 'Card',
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
};

const boards: { [id: string]: KanbanBoard } = {
    b1: {
        _id: 'b1',
        name: 'Alpha',
        description: '',
        lists: ['l1', 'l2'],
        focusedList: 'l2',
        doneList: 'l3',
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
                lists: { l1: list('l1', 'Todo', ['c1']), l2: list('l2', 'Doing', []) },
                cards: { c1: card },
            },
        } as any,
        applyMiddleware(thunk)
    );

const renderDialog = () => {
    const onClose = jest.fn();
    const onMoved = jest.fn();
    render(
        <Provider store={makeStore()}>
            <CardMoveDialog
                open
                cardId="c1"
                sourceListId="l1"
                onClose={onClose}
                onMoved={onMoved}
            />
        </Provider>
    );
    return { onClose, onMoved };
};

const pickProject = () => fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));

beforeEach(() => {
    moveCard.mockReset();
    moveCard.mockResolvedValue({ updatedCards: {}, updatedLists: {}, updatedBoards: {} });
    // The main-process command is the boundary; the thunk that wraps it runs
    // for real, so its dispatch (and the store update) is part of the test.
    (window as any).api = { ...(window as any).api, moveCardToBoard: moveCard };
    (feedback.toast as jest.Mock).mockClear();
    (feedback.alert as jest.Mock).mockClear();
});

describe('CardMoveDialog', () => {
    it('asks for a project first, then a list, then moves', async () => {
        const { onClose, onMoved } = renderDialog();

        // The list step does not exist until a project is picked.
        expect(screen.queryByRole('button', { name: /^Move$|^移动$/ })).toBeNull();
        pickProject();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Move$|^移动$/ }));
        });

        expect(moveCard).toHaveBeenCalledWith({ cardId: 'c1', targetListId: 'l2' });
        expect(feedback.toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        // The card now lives elsewhere, so the editor that opened this has to
        // close as well.
        expect(onMoved).toHaveBeenCalledTimes(1);
    });

    it('stays open and reports the failure when the move is rejected', async () => {
        moveCard.mockRejectedValue(new Error('same list'));
        const { onClose, onMoved } = renderDialog();

        pickProject();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Move$|^移动$/ }));
        });

        expect(feedback.alert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
        expect(onClose).not.toHaveBeenCalled();
        expect(onMoved).not.toHaveBeenCalled();
    });

    it('goes back to the project step instead of closing', () => {
        const { onClose } = renderDialog();

        pickProject();
        fireEvent.click(screen.getByRole('button', { name: /Cancel|取消/ }));

        expect(onClose).not.toHaveBeenCalled();
        // The project grid is reachable again.
        expect(screen.getByRole('option', { name: 'Alpha' })).toBeTruthy();
    });
});
