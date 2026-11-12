import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { CardPicker } from './CardPicker';
import type { Card, KanbanBoard, List } from './type';

const list = (id: string, title: string, cards: string[]): List => ({ _id: id, title, cards });

const card = (id: string, title?: string): Card => ({
    _id: id,
    title: title ?? id,
    content: '',
    sessionIds: [],
    spentTimeInHour: { estimated: 0, actual: 0 },
});

const board: KanbanBoard = {
    _id: 'b1',
    name: 'Project',
    description: '',
    lists: ['l1', 'l2', 'l3'],
    focusedList: 'l1',
    doneList: 'l2',
    relatedSessions: [],
    spentHours: 0,
};

const makeStore = (over: { lists?: any; cards?: any } = {}) =>
    createStore((state: any) => state, {
        kanban: {
            boards: { b1: board },
            lists: {
                // `l3` exists in the board but holds no cards, so it must
                // not become an empty column.
                l1: list('l1', 'Todo', ['c1', 'c2']),
                l2: list('l2', 'Done', ['c3']),
                l3: list('l3', 'Empty', []),
                ...over.lists,
            },
            cards: {
                c1: card('c1', 'First'),
                c2: card('c2', ''),
                c3: card('c3', 'Third'),
                ...over.cards,
            },
        },
    } as any);

const renderPicker = (over: { boardId?: string; lists?: any; cards?: any } = {}) => {
    const onPick = jest.fn();
    render(
        <Provider store={makeStore(over)}>
            <CardPicker open boardId={over.boardId ?? 'b1'} onPick={onPick} onClose={jest.fn()} />
        </Provider>
    );
    return onPick;
};

describe('CardPicker', () => {
    it('renders one column per non-empty list and picks a card', () => {
        const onPick = renderPicker();

        expect(screen.getByText('Todo')).toBeTruthy();
        expect(screen.getByText('Done')).toBeTruthy();
        expect(screen.queryByText('Empty')).toBeNull();

        fireEvent.click(screen.getByTitle('First'));
        expect(onPick).toHaveBeenCalledWith('c1');
    });

    it('falls back to a placeholder for an untitled card', () => {
        const onPick = renderPicker();
        // `c2` has an empty title; the row still has to be clickable and
        // readable.
        const blank = document.querySelector('button[title=""]') as HTMLButtonElement;
        expect(blank.textContent).toMatch(/Untitled|无标题/);

        fireEvent.click(blank);
        expect(onPick).toHaveBeenCalledWith('c2');
    });

    it('picks "no card" from the footer', () => {
        const onPick = renderPicker();
        fireEvent.click(screen.getByRole('button', { name: /No card|不挂卡/ }));
        expect(onPick).toHaveBeenCalledWith(undefined);
    });

    it('shows the empty state when the board has no card', () => {
        const onPick = renderPicker({
            lists: {
                l1: list('l1', 'Todo', []),
                l2: list('l2', 'Done', []),
                l3: list('l3', 'Empty', []),
            },
        });

        expect(screen.getByText(/no cards|还没有卡片/i)).toBeTruthy();
        expect(onPick).not.toHaveBeenCalled();
    });
});
