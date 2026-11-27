import React from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
    KanbanHarness,
    makeStore,
    mockKanbanLayout,
    mockUnassignedSessions,
    openBoard,
    press,
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

describe('Kanban page shortcuts and search', () => {
    beforeAll(mockKanbanLayout);
    afterAll(resetKanbanLayout);
    beforeEach(mockUnassignedSessions);

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('handles the page hotkeys', async () => {
        const { actions } = renderKanban();

        await press('n', { ctrlKey: true });
        expect(await screen.findByRole('dialog')).toBeTruthy();

        // The dialog owns the keyboard while it is open (Hotkeys' modal gate),
        // so close it before the page-level Esc.
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        await press('Escape');
        expect(actions.changeAppTab).toHaveBeenCalledWith('timer');
    });

    it('goes back on esc, but leaves it to the fullscreen record overlay', async () => {
        const { props, actions, rerender } = openBoard();

        await press('Escape');
        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
        expect(actions.changeAppTab).not.toHaveBeenCalled();

        const store = makeStore(props.boards, props.kanban, true);
        rerender(
            <KanbanHarness props={{ ...props, chosenRecord: { _id: 'record' } }} store={store} />
        );

        await press('Escape');
        // Only the first press went back; the overlay owns this one.
        expect(actions.setChosenBoardId).toHaveBeenCalledTimes(1);
        expect(actions.changeAppTab).not.toHaveBeenCalled();
    });

    it('clears the search when the page is no longer active', () => {
        const { actions } = renderKanban({
            currentTab: 'timer',
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
                searchReg: undefined,
                searchRegex: false,
            },
        });

        expect(actions.setSearchReg).toHaveBeenCalledWith(undefined);
        expect(actions.setSearchRegex).toHaveBeenCalledWith(false);
        expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();
    });

    it('hands the regex toggle and its invalid state to the search bar', () => {
        const { actions } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
                searchReg: '(',
                searchRegex: true,
            },
        });

        // A non-empty `searchReg` opens the bar by itself (Search restores
        // the saved query when the page mounts), so the input is already
        // there and already knows it came from an invalid expression.
        const input = screen.getByRole('textbox', { name: 'Search' });
        expect(input.getAttribute('aria-invalid')).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: 'Turn off regular expressions' }));
        expect(actions.setSearchRegex).toHaveBeenCalledWith(false);
    });
});
