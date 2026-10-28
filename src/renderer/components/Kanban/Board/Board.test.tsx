import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Board } from './Board';

jest.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ onDragEnd, children }: any) => {
        (global as any).__onDragEnd = onDragEnd;
        return <div data-testid="drag-context">{children}</div>;
    },
    Droppable: ({ children }: any) =>
        children({ innerRef: jest.fn(), droppableProps: {}, placeholder: null }),
}));

jest.mock('../List', () => ({
    __esModule: true,
    default: ({ listId, preview, focused, done }: any) => (
        <div
            data-testid={`list-${listId}`}
            data-preview={String(!!preview)}
            data-focused={String(!!focused)}
            data-done={String(!!done)}
        />
    ),
}));

const board = {
    _id: 'board-1',
    name: 'Board',
    lists: ['todo', 'doing', 'done'],
    focusedList: 'doing',
    doneList: 'done',
    spentHours: 0,
    description: '',
    relatedSessions: [],
};

const renderBoard = (props: Partial<React.ComponentProps<typeof Board>> = {}) => {
    const actions = {
        addList: jest.fn().mockResolvedValue(undefined),
        moveList: jest.fn(),
        moveCard: jest.fn(),
    };
    const view = render(
        <Board boardId="board-1" showHeader {...board} {...(actions as any)} {...props} />
    );
    return { ...view, actions };
};

const dragEnd = (result: any) => {
    (global as any).__onDragEnd(result);
};

describe('Kanban Board', () => {
    afterEach(() => {
        cleanup();
        delete (global as any).__onDragEnd;
    });

    it('renders every list with its focused/done flags', () => {
        const { getByTestId } = renderBoard();

        expect(getByTestId('list-todo').getAttribute('data-focused')).toBe('false');
        expect(getByTestId('list-doing').getAttribute('data-focused')).toBe('true');
        expect(getByTestId('list-done').getAttribute('data-done')).toBe('true');
    });

    it('renders nothing for a board that has already been deleted', () => {
        const { container } = renderBoard({ _id: undefined as any });

        expect(container.firstChild).toBeNull();
    });

    it('renders only the focused list in preview mode', () => {
        const { container, queryByTestId } = renderBoard({ preview: true });

        expect(container.querySelectorAll('[data-testid^="list-"]')).toHaveLength(1);
        expect(queryByTestId('list-doing')?.getAttribute('data-preview')).toBe('true');
        expect(container.querySelector('button')).toBeNull();
    });

    it('adds a list to this board', async () => {
        const { container, actions } = renderBoard();

        fireEvent.click(container.querySelector('button')!);

        expect(actions.addList).toHaveBeenCalledWith('board-1', 'TestList');
    });

    it('moves a column only when its position actually changed', () => {
        const { actions } = renderBoard();

        dragEnd({
            type: 'COLUMN',
            source: { droppableId: 'board-1', index: 0 },
            destination: { droppableId: 'board-1', index: 2 },
        });
        expect(actions.moveList).toHaveBeenCalledWith('board-1', 0, 2);

        dragEnd({
            type: 'COLUMN',
            source: { droppableId: 'board-1', index: 1 },
            destination: { droppableId: 'board-1', index: 1 },
        });
        expect(actions.moveList).toHaveBeenCalledTimes(1);
    });

    it('moves a card across lists or indices, and ignores a drop outside', () => {
        const { actions } = renderBoard();

        dragEnd({
            type: 'DEFAULT',
            source: { droppableId: 'todo', index: 1 },
            destination: { droppableId: 'done', index: 0 },
        });
        expect(actions.moveCard).toHaveBeenCalledWith('todo', 'done', 1, 0);

        dragEnd({
            type: 'DEFAULT',
            source: { droppableId: 'todo', index: 1 },
            destination: { droppableId: 'todo', index: 1 },
        });
        expect(actions.moveCard).toHaveBeenCalledTimes(1);

        dragEnd({
            type: 'DEFAULT',
            source: { droppableId: 'todo', index: 1 },
            destination: null,
        });
        expect(actions.moveCard).toHaveBeenCalledTimes(1);
    });
});
