import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { ProjectPicker } from './ProjectPicker';
import type { KanbanBoard } from './type';

const board = (over: Partial<KanbanBoard> & { _id: string }): KanbanBoard =>
    ({
        name: over._id,
        description: '',
        lists: [],
        focusedList: '',
        doneList: '',
        relatedSessions: [],
        spentHours: 0,
        ...over,
    }) as KanbanBoard;

const makeStore = (boards: KanbanBoard[]) =>
    createStore((state: any) => state, {
        kanban: {
            boards: Object.fromEntries(boards.map((row) => [row._id, row])),
            lists: {},
            cards: {},
        },
    } as any);

const renderPicker = (
    boards: KanbanBoard[],
    over: Partial<React.ComponentProps<typeof ProjectPicker>> = {}
) => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(
        <Provider store={makeStore(boards)}>
            <ProjectPicker open onPick={onPick} onClose={onClose} {...over} />
        </Provider>
    );
    return { onPick, onClose };
};

/** The options in render order; the dialog's own buttons have no `title`. */
const options = () =>
    Array.from(document.querySelectorAll('button[title]')).map((node) => node.textContent ?? '');

describe('ProjectPicker', () => {
    it('lists projects newest first by default', () => {
        renderPicker([
            board({ _id: 'old', name: 'Old', createdTime: 100 }),
            board({ _id: 'new', name: 'New', createdTime: 300 }),
            board({ _id: 'mid', name: 'Mid', createdTime: 200 }),
        ]);

        expect(options()).toEqual(['New', 'Mid', 'Old']);
    });

    it('filters by name, ignoring case, and reports an empty result', () => {
        renderPicker([
            board({ _id: 'a', name: 'Alpha', createdTime: 2 }),
            board({ _id: 'b', name: 'Beta', createdTime: 1 }),
        ]);

        fireEvent.change(screen.getByPlaceholderText(/Search projects|搜索项目/), {
            target: { value: 'ALP' },
        });
        expect(options()).toEqual(['Alpha']);

        fireEvent.change(screen.getByPlaceholderText(/Search projects|搜索项目/), {
            target: { value: 'nothing' },
        });
        expect(options()).toEqual([]);
        expect(screen.getByText(/No matching projects|没有匹配的项目/)).toBeTruthy();
    });

    it('marks hidden projects but still lets them be picked', () => {
        const { onPick } = renderPicker([board({ _id: 'h', name: 'Archived', hidden: true })]);

        expect(screen.getByText(/^(Hidden|已隐藏)$/)).toBeTruthy();
        fireEvent.click(screen.getByTitle('Archived'));
        expect(onPick).toHaveBeenCalledWith('h');
    });

    it('offers "no project" only when the caller allows it', () => {
        const { onPick } = renderPicker([board({ _id: 'a', name: 'Alpha' })], {
            allowNone: false,
        });
        expect(screen.queryByRole('button', { name: /No project|无项目/ })).toBeNull();
        expect(onPick).not.toHaveBeenCalled();
    });

    it('picks no project from the footer button', () => {
        const { onPick } = renderPicker([board({ _id: 'a', name: 'Alpha' })]);

        fireEvent.click(screen.getByRole('button', { name: /No project|无项目/ }));
        expect(onPick).toHaveBeenCalledWith(undefined);
    });
});
