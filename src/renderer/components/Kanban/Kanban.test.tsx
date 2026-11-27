import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import {
    KanbanHarness,
    makeStore,
    mockKanbanLayout,
    mockUnassignedSessions,
    openBoard,
    renderKanban,
    resetKanbanLayout,
} from './Kanban.testSupport';
import { dragActivity } from './dragActivity';

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

describe('Kanban page', () => {
    beforeAll(mockKanbanLayout);
    afterAll(resetKanbanLayout);
    beforeEach(mockUnassignedSessions);

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        dragActivity.dragging = false;
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('fetches boards, shows the overview and toggles its sort direction', () => {
        const { actions } = renderKanban();

        expect(actions.fetchBoards).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Kanban Boards Overview')).toBeTruthy();
        expect(screen.getByText('Board One')).toBeTruthy();
        // The board view is not rendered until a board is chosen.
        expect(screen.queryByRole('heading', { name: 'Todo' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Ascending' }));
        expect(actions.setSortDirection).toHaveBeenCalledWith('desc');
    });

    it('shows the chosen board and starts focusing', async () => {
        const { actions, timerManager } = openBoard();

        expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Doing' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Done' })).toBeTruthy();
        expect(screen.getAllByText(/Created:/).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(actions.focusOn).toHaveBeenCalledWith('b1');
        expect(timerManager.start).toHaveBeenCalledWith('b1');
        expect(await screen.findByText('Start Focusing')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
    });

    it('pauses a running focus session', async () => {
        const paused = renderKanban({
            minimize: true,
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
                searchReg: undefined,
                searchRegex: false,
            },
            isFocusingOnChosenBoard: true,
            isTimerRunning: true,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        expect(paused.timerManager.pause).toHaveBeenCalled();
        expect(await screen.findByText('Paused')).toBeTruthy();
    });

    it('drops a drag lost to a page switch and rebuilds the board', () => {
        dragActivity.dragging = true;
        const { props, rerender } = openBoard();
        const store = makeStore(props.boards, props.kanban, true);

        rerender(<KanbanHarness props={{ ...props, currentTab: 'timer' }} store={store} />);

        expect(dragActivity.dragging).toBe(false);

        rerender(<KanbanHarness props={{ ...props, currentTab: 'kanban' }} store={store} />);

        // The rebuilt board is usable: the lists are back.
        expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy();
    });
});
