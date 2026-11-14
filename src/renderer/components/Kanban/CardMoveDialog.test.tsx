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

const list = (id: string, title: string, cards: string[] = []): List => ({ _id: id, title, cards });

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
    b2: {
        _id: 'b2',
        name: 'Beta',
        description: '',
        lists: ['l3', 'l4'],
        focusedList: 'l4',
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
                lists: {
                    l1: list('l1', 'Todo', ['c1']),
                    l2: list('l2', 'Doing'),
                    l3: list('l3', 'Archive'),
                    l4: list('l4', 'Review'),
                },
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

const pickProject = (name = 'Alpha') => fireEvent.click(screen.getByRole('option', { name }));
const cancelButton = () => screen.getByRole('button', { name: /^Cancel$|^取消$/ });

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
        fireEvent.click(cancelButton());

        expect(onClose).not.toHaveBeenCalled();
        // The project grid is reachable again.
        expect(screen.getByRole('option', { name: 'Alpha' })).toBeTruthy();
    });

    // Regression: the two steps used to be two dialogs closed and opened in the
    // same commit. rc-motion keeps the closing mask mounted until its leave
    // animation ends, so for a frame the old and the new 45%-black masks were
    // both there -- the background flashed darker at every step change. One
    // dialog means one mask; the node must survive the switch.
    it('keeps a single dialog when moving to the list step', () => {
        renderDialog();
        const dialog = screen.getByRole('dialog');

        pickProject();

        expect(screen.getByRole('dialog')).toBe(dialog);
    });

    it('resets the list choice when another project is picked', () => {
        renderDialog();

        pickProject('Alpha');
        // Alpha focuses "Doing", so that is preselected.
        expect(
            screen.getByRole('option', { name: /Doing/ }).getAttribute('aria-selected')
        ).toBe('true');

        fireEvent.click(cancelButton());
        pickProject('Beta');

        // Beta focuses "Review"; nothing carries over from Alpha.
        expect(
            screen.getByRole('option', { name: /Review/ }).getAttribute('aria-selected')
        ).toBe('true');
    });
});
