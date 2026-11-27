import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import { thunk } from 'redux-thunk';
import { Kanban } from './Kanban';
import { dragActivity } from './dragActivity';
import { FeedbackContextBridge } from '../feedback/Feedback';

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

const board = {
    _id: 'b1',
    name: 'Board One',
    description: 'New desc',
    createdTime: 1600000000000,
    lists: ['todo', 'doing', 'done'],
    focusedList: 'doing',
    doneList: 'done',
    spentHours: 3,
    relatedSessions: [{ _id: 'session' }],
    pin: false,
};

/** The lists `board.lists` points at, as the connected List reads them. */
const lists = {
    todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
    doing: { _id: 'doing', title: 'Doing', cards: [] },
    done: { _id: 'done', title: 'Done', cards: ['done-card'] },
};

const cards = {
    'todo-card': {
        _id: 'todo-card',
        title: 'Todo card',
        content: 'todo body',
        sessionIds: [],
        spentTimeInHour: { estimated: 2, actual: 1 },
        createdTime: 1600000000000,
    },
    'done-card': {
        _id: 'done-card',
        title: 'Done card',
        content: 'done body',
        sessionIds: [],
        spentTimeInHour: { estimated: 4, actual: 2 },
        createdTime: 1600000000000,
    },
};

const baseState = {
    boards: { b1: board },
    lists,
    cards,
};

/**
 * The store is handed the state directly (identity reducer): the page and its
 * connected children only read it, so what is asserted is the actions the page
 * calls and what the user sees -- not a reduced state the test would rebuild.
 * `thunk` is needed because the connected `List` dispatches a thunk
 * (`setVisibleCards`).
 */
const makeStore = (boards: any, kanban: any) =>
    createStore(
        (value: any) => value,
        {
            kanban: {
                boards,
                lists,
                cards,
                kanban: {
                    sortedBy: 'recent',
                    sortDirection: 'asc',
                    isSearching: false,
                    searchRegex: false,
                    chosenBoardId: undefined,
                    editCard: { isEditing: false, listId: '' },
                    ...kanban,
                },
            },
            timer: {
                minimize: false,
                boardId: undefined,
                isRunning: false,
                isFocusing: false,
                timerManager: { start: jest.fn(), pause: jest.fn() },
            },
        } as any,
        applyMiddleware(thunk) as any
    );

const makeProps = (overrides: any = {}) => {
    const actions = {
        addBoard: jest.fn(),
        editBoard: jest.fn(),
        deleteBoard: jest.fn(),
        fetchBoards: jest.fn(),
        focusOn: jest.fn(),
        setChosenBoardId: jest.fn(),
        setCardView: jest.fn(),
        setSearchReg: jest.fn(),
        setSearchRegex: jest.fn(),
        setSortDirection: jest.fn(),
        setSortedBy: jest.fn(),
        changeAppTab: jest.fn(),
    };
    const timerManager = { start: jest.fn(), pause: jest.fn() };
    const props: any = {
        ...baseState,
        kanban: {
            chosenBoardId: undefined,
            configuringBoardId: undefined,
            sortedBy: 'recent',
            sortDirection: 'asc',
            searchReg: undefined,
            searchRegex: false,
        },
        chosenRecord: undefined,
        currentTab: 'kanban',
        isFocusingOnChosenBoard: false,
        isTimerRunning: false,
        timerManager,
        ...actions,
        ...overrides,
    };
    return { props, actions, timerManager };
};

const renderKanban = (overrides: any = {}) => {
    const setup = makeProps(overrides);
    const store = makeStore(setup.props.boards, setup.props.kanban);
    const view = render(
        <AntdApp>
            <FeedbackContextBridge />
            <Provider store={store}>
                <Kanban {...setup.props} />
            </Provider>
        </AntdApp>
    );
    return { ...view, ...setup };
};

/** Press and release a combination the way Hotkeys expects to receive it. */
const press = async (key: string, init: KeyboardEventInit = {}) => {
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
        );
    });
    await act(async () => {
        document.dispatchEvent(
            new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init })
        );
        if (init.ctrlKey) {
            document.dispatchEvent(
                new KeyboardEvent('keyup', { key: 'Control', bubbles: true, cancelable: true })
            );
        }
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const openBoard = () =>
    renderKanban({
        kanban: {
            chosenBoardId: 'b1',
            configuringBoardId: undefined,
            sortedBy: 'recent',
            sortDirection: 'asc',
            searchReg: undefined,
            searchRegex: false,
        },
    });

describe('Kanban page', () => {
    beforeAll(() => {
        // jsdom reports 0 width; the overview grid needs a column count to
        // render its cards (see Overview.grid.test.tsx).
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return 810;
            },
        });
        // ...and a card needs a non-zero box before the grid can measure it.
        for (const property of ['clientHeight', 'offsetHeight', 'scrollHeight'] as const) {
            Object.defineProperty(HTMLElement.prototype, property, {
                configurable: true,
                get() {
                    return 100;
                },
            });
        }
    });

    afterAll(() => {
        delete (HTMLElement.prototype as any).clientWidth;
        for (const property of ['clientHeight', 'offsetHeight', 'scrollHeight']) {
            delete (HTMLElement.prototype as any)[property];
        }
    });

    beforeEach(() => {
        // The unassigned-sessions hook asks the IPC bridge on mount. Leaving
        // the request pending keeps its state update out of the test (the
        // header count stays at its initial 0), so no promise settles after
        // the assertions.
        jest.spyOn(window.api as any, 'listUnassignedSessions').mockReturnValue(
            new Promise(() => undefined) as any
        );
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        dragActivity.dragging = false;
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('fetches boards and shows the overview without a chosen board', () => {
        const { actions } = renderKanban();

        expect(actions.fetchBoards).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Kanban Boards Overview')).toBeTruthy();
        expect(screen.getByText('Board One')).toBeTruthy();
        // The board view is not rendered until a board is chosen.
        expect(screen.queryByRole('heading', { name: 'Todo' })).toBeNull();
    });

    it('opens the empty board form from the create button', async () => {
        renderKanban();

        fireEvent.click(screen.getByRole('button', { name: 'Create a new board' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Create a new board')).toBeTruthy();
        expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
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

    it('cancels the board form', async () => {
        renderKanban();

        fireEvent.click(screen.getByRole('button', { name: 'Create a new board' }));
        await screen.findByRole('dialog');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('shows the chosen board and goes back', async () => {
        const { actions } = openBoard();

        expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Doing' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Done' })).toBeTruthy();
        expect(screen.getAllByText(/Created:/).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
    });

    it('starts focusing on the chosen board and pauses it when it is already running', async () => {
        const first = openBoard();

        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(first.actions.focusOn).toHaveBeenCalledWith('b1');
        expect(first.timerManager.start).toHaveBeenCalledWith('b1');
        expect(await screen.findByText('Start Focusing')).toBeTruthy();

        cleanup();
        document.body.innerHTML = '';

        const paused = renderKanban({
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

    it('toggles the sort direction and shows the board view controls', async () => {
        const { actions } = renderKanban();

        fireEvent.click(screen.getByRole('button', { name: 'Ascending' }));
        expect(actions.setSortDirection).toHaveBeenCalledWith('desc');

        cleanup();
        document.body.innerHTML = '';

        openBoard();
        await act(async () => {});

        expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy();
    });

    it('edits the chosen board through the settings form', async () => {
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
    });

    it('deletes the chosen board from the settings form', async () => {
        const { actions } = openBoard();

        fireEvent.click(screen.getByRole('button', { name: 'Edit board' }));
        await screen.findByRole('dialog');

        fireEvent.click(screen.getByRole('button', { name: /Delete/ }));

        // The delete goes through the real feedback confirm.
        const titles = await screen.findAllByText('Delete board "Board One"?');
        expect(titles.length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByRole('button', { name: 'OK' })[0]);

        await waitFor(() => expect(actions.deleteBoard).toHaveBeenCalledWith('b1'));
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

    it('goes back to the overview instead of leaving the page on esc', async () => {
        const { actions } = openBoard();

        await press('Escape');

        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
        expect(actions.changeAppTab).not.toHaveBeenCalled();
    });

    it('leaves esc to the fullscreen record overlay', async () => {
        const { actions } = renderKanban({
            chosenRecord: { _id: 'record' },
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
                searchReg: undefined,
                searchRegex: false,
            },
        });

        await press('Escape');

        expect(actions.setChosenBoardId).not.toHaveBeenCalled();
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

    // Regression: a drag still running when the page was switched away never
    // reached dnd's onDragEnd, so its pointer-events: none styles stayed on
    // every card -- the pointer fell back to the default cursor and dragging
    // was dead until the board was remounted by hand (leave and re-enter).
    it('drops a drag lost to a page switch and rebuilds the board', () => {
        dragActivity.dragging = true;
        const { props, rerender } = openBoard();
        const store = makeStore(props.boards, props.kanban);

        rerender(
            <AntdApp>
                <FeedbackContextBridge />
                <Provider store={store}>
                    <Kanban {...props} currentTab="timer" />
                </Provider>
            </AntdApp>
        );

        expect(dragActivity.dragging).toBe(false);

        rerender(
            <AntdApp>
                <FeedbackContextBridge />
                <Provider store={store}>
                    <Kanban {...props} currentTab="kanban" />
                </Provider>
            </AntdApp>
        );

        // The rebuilt board is usable: the lists are back.
        expect(screen.getByRole('heading', { name: 'Todo' })).toBeTruthy();
    });
});

describe('Kanban overview header', () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return 810;
            },
        });
        for (const property of ['clientHeight', 'offsetHeight', 'scrollHeight'] as const) {
            Object.defineProperty(HTMLElement.prototype, property, {
                configurable: true,
                get() {
                    return 100;
                },
            });
        }
    });

    afterAll(() => {
        delete (HTMLElement.prototype as any).clientWidth;
        for (const property of ['clientHeight', 'offsetHeight', 'scrollHeight']) {
            delete (HTMLElement.prototype as any)[property];
        }
    });

    beforeEach(() => {
        jest.spyOn(window.api as any, 'listUnassignedSessions').mockReturnValue(
            new Promise(() => undefined) as any
        );
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('switches the overview between the board grid and the table', () => {
        renderKanban();
        expect(screen.queryByRole('table')).toBeNull();

        fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
        expect(screen.getByRole('table')).toBeTruthy();

        fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText('Board One')).toBeTruthy();
    });

    // Regression: the icon-only segments got their name from the icon itself
    // ("eye", "appstore") until each label carried an explicit aria-label, so
    // the control was unusable without sight.
    it('names the visibility segments after the boards they show', () => {
        const hidden = { ...board, _id: 'b2', name: 'Board Two', hidden: true };
        renderKanban({ boards: { b1: board, b2: hidden } });

        expect(screen.queryByText('Board Two')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Hidden (1)' }));
        expect(screen.getByText('Board Two')).toBeTruthy();

        fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
        expect(screen.getByText('Board One')).toBeTruthy();
    });

    it('keeps the hidden segment usable when nothing is hidden', () => {
        renderKanban();

        fireEvent.click(screen.getByRole('radio', { name: 'Hidden (0)' }));

        expect(screen.getByText('No hidden boards')).toBeTruthy();
    });
});
