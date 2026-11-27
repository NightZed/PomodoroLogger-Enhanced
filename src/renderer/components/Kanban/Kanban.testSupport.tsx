import React from 'react';
import { act, render } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import { thunk } from 'redux-thunk';
import { Kanban } from './Kanban';
import { FeedbackContextBridge } from '../feedback/Feedback';

/**
 * Shared fixtures and harness for the Kanban page tests.
 *
 * The two test files (`Kanban.test.tsx`, `Kanban.overview.test.tsx`) keep
 * their own `jest.mock` calls -- Jest hoists those per file, they cannot be
 * imported -- but everything else lives here so both files render the same
 * page against the same store.
 */
export const board = {
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
export const lists = {
    todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
    doing: { _id: 'doing', title: 'Doing', cards: [] },
    done: { _id: 'done', title: 'Done', cards: ['done-card'] },
};

export const cards = {
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
const makeStore = (boards: any, kanban: any, minimize = false) =>
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
                minimize,
                boardId: undefined,
                isRunning: false,
                isFocusing: false,
                timerManager: { start: jest.fn(), pause: jest.fn() },
            },
        } as any,
        applyMiddleware(thunk) as any
    );

export { makeStore };

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

export const renderKanban = (overrides: any = {}) => {
    const setup = makeProps(overrides);
    // With a board open the overview is hidden behind `display: none`, so the
    // tests can suspend its grid (as the mini window does) and skip laying out
    // one brief card per board on every render.
    const store = makeStore(setup.props.boards, setup.props.kanban, overrides.minimize === true);
    const view = render(<KanbanHarness props={setup.props} store={store} />);
    return { ...view, ...setup };
};

/** The page with its providers, for tests that rerender with a new store. */
export const KanbanHarness = ({ props, store }: { props: any; store: any }) => (
    <AntdApp>
        <FeedbackContextBridge />
        <Provider store={store}>
            <Kanban {...props} />
        </Provider>
    </AntdApp>
);

/** Press and release a combination the way Hotkeys expects to receive it. */
export const press = async (key: string, init: KeyboardEventInit = {}) => {
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

export const openBoard = () =>
    renderKanban({
        minimize: true,
        kanban: {
            chosenBoardId: 'b1',
            configuringBoardId: undefined,
            sortedBy: 'recent',
            sortDirection: 'asc',
            searchReg: undefined,
            searchRegex: false,
        },
    });

/**
 * jsdom reports every box as 0x0. The overview needs a width for its column
 * count and a card needs a height before the grid can measure it.
 */
export const mockKanbanLayout = () => {
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
};

export const resetKanbanLayout = () => {
    delete (HTMLElement.prototype as any).clientWidth;
    for (const property of ['clientHeight', 'offsetHeight', 'scrollHeight']) {
        delete (HTMLElement.prototype as any)[property];
    }
};

/**
 * The unassigned-sessions hook asks the IPC bridge on mount. Leaving the
 * request pending keeps its state update out of the test (the header count
 * stays at its initial 0), so no promise settles after the assertions.
 */
export const mockUnassignedSessions = () => {
    jest.spyOn(window.api as any, 'listUnassignedSessions').mockReturnValue(
        new Promise(() => undefined) as any
    );
};
