import React from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
    mockKanbanLayout,
    mockUnassignedSessions,
    openBoard,
    renderKanban,
    resetKanbanLayout,
} from './Kanban.testSupport';

// dnd is the one boundary these tests still stand in for: the real library
// needs a layout to measure. Board, lists, cards, the overview, the editor,
// the search bar and the feedback layer all run for real below.
jest.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: any) => <div>{children}</div>,
    Droppable: ({ children }: any) =>
        children(
            {
                innerRef: () => undefined,
                droppableProps: {},
                placeholder: null,
            },
            { isDraggingOver: false }
        ),
    Draggable: ({ children }: any) =>
        children(
            { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false }
        ),
}));

// rc-textarea measures a hidden textarea to size itself; jsdom has no line
// metrics, so the real one writes `height: NaN` during the board editor's
// force-rendered first paint. The description field is not what these tests
// are about, and BoardEditor.test.tsx stubs it for the same reason.
jest.mock('antd/lib/input/TextArea', () => ({ __esModule: true, default: () => null }));

describe('Kanban board form', () => {
    beforeAll(mockKanbanLayout);
    afterAll(resetKanbanLayout);
    beforeEach(mockUnassignedSessions);

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('opens the empty board form and cancels it', async () => {
        renderKanban();

        fireEvent.click(screen.getByRole('button', { name: 'Create a new board' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Create a new board')).toBeTruthy();
        expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('creates a board and closes the form', async () => {
        const { actions } = renderKanban();

        fireEvent.click(screen.getByRole('button', { name: 'Create a new board' }));
        await screen.findByRole('dialog');

        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Board' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(actions.addBoard).toHaveBeenCalledWith(expect.any(String), 'New Board', '')
        );
        expect(actions.addBoard.mock.calls[0][0]).toMatch(/^[\w-]+$/);

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('edits and deletes the chosen board through the settings form', async () => {
        const { actions } = openBoard();

        fireEvent.click(screen.getByRole('button', { name: 'Edit board' }));
        await screen.findByRole('dialog');

        const name = screen.getByLabelText('Name') as HTMLInputElement;
        expect(name.value).toBe('Board One');

        fireEvent.change(name, { target: { value: 'New Board' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(actions.editBoard).toHaveBeenCalledWith('b1', 'New Board', 'New desc', false)
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'Edit board' }));
        await screen.findByRole('dialog');

        fireEvent.click(screen.getByRole('button', { name: /Delete/ }));

        // The delete goes through the real feedback confirm.
        const titles = await screen.findAllByText('Delete board "Board One"?');
        expect(titles.length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByRole('button', { name: 'OK' })[0]);

        await waitFor(() => expect(actions.deleteBoard).toHaveBeenCalledWith('b1'));
    });
});
