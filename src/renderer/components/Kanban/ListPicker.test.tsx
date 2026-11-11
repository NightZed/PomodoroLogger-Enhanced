import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { ListPicker } from './ListPicker';
import type { Card, KanbanBoard, List } from './type';

const list = (id: string, title: string, cards: string[] = []): List => ({
    _id: id,
    title,
    cards,
});

const card = (id: string, sessionIds: string[]): Card => ({
    _id: id,
    title: id,
    content: '',
    sessionIds,
    spentTimeInHour: { estimated: 0, actual: 0 },
});

const board: KanbanBoard = {
    _id: 'b1',
    name: 'Project B',
    description: '',
    lists: ['l1', 'l2', 'l3'],
    focusedList: 'l2',
    doneList: 'l3',
    relatedSessions: [],
    spentHours: 0,
};

const makeStore = () =>
    createStore((state: any) => state, {
        kanban: {
            boards: { b1: board },
            lists: { l1: list('l1', 'Todo'), l2: list('l2', 'Doing'), l3: list('l3', 'Done') },
            // `c1` shares s1 with `cs`, which is what the shared-session
            // hint has to report.
            cards: { c1: card('c1', ['s1']), cs: card('cs', ['s1']) },
        },
    } as any);

const renderPicker = (over: { sourceListId?: string } = {}) => {
    const onMove = jest.fn();
    render(
        <Provider store={makeStore()}>
            <ListPicker
                open
                boardId="b1"
                cardId="c1"
                sourceListId={over.sourceListId}
                onMove={onMove}
                onCancel={jest.fn()}
            />
        </Provider>
    );
    return onMove;
};

const confirmButton = () => screen.getByRole('button', { name: /Move|移动/ });

describe('ListPicker', () => {
    it('defaults to the focused list and moves there', () => {
        const onMove = renderPicker();
        fireEvent.click(confirmButton());
        expect(onMove).toHaveBeenCalledWith('l2');
    });

    it('disables the list the card is already in', () => {
        const onMove = renderPicker({ sourceListId: 'l2' });

        expect((screen.getByTitle('Doing') as HTMLButtonElement).disabled).toBe(true);
        // With the focused list unavailable the first usable one is selected.
        fireEvent.click(confirmButton());
        expect(onMove).toHaveBeenCalledWith('l1');
    });
});
