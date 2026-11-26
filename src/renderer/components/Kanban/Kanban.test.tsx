import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Kanban } from './Kanban';
import { dragActivity } from './dragActivity';

jest.mock('./Board', () => {
    const React = require('react');
    const BoardStub = () => {
        // Counts mounts, not renders: the point is whether the board is
        // rebuilt (see the drag-safety test below).
        React.useEffect(() => {
            const g = global as any;
            g.__boardMounts = (g.__boardMounts ?? 0) + 1;
        }, []);
        return <div data-testid="board" />;
    };

    return { __esModule: true, default: BoardStub };
});
jest.mock('./Board/Overview', () => ({
    Overview: ({ showConfigById, showTable, showHidden }: any) => (
        <div data-testid="overview" data-table={String(showTable)} data-hidden={String(showHidden)}>
            <button data-testid="overview-configure" onClick={() => showConfigById('b1')} />
        </div>
    ),
}));
// The drawer and its card picker are connected and have their own tests;
// this page is rendered bare, without a store.
jest.mock('./Board/UnassignedPanel', () => ({ UnassignedPanel: () => null }));
// The hook queries the database on mount; this page's tests do not wait for
// that promise, and an unawaited state update outside `act` trips the gate.
jest.mock('./Board/useUnassignedSessions', () => ({
    useUnassignedSessions: () => ({ rows: [], total: 0, reload: jest.fn() }),
}));
jest.mock('./Board/PlayPauseButton', () => ({
    PlayPauseButton: ({ onClick, showPlay }: any) => (
        <button data-testid="play-pause" data-play={String(showPlay)} onClick={onClick} />
    ),
}));
jest.mock('./BoardEditor', () => {
    const { Form } = require('antd');
    return {
        EditKanbanForm: (props: any) => {
            (global as any).__formProps = props;
            return (
                <div data-testid="board-form" data-creating={String(props.isCreating)}>
                    {props.visible ? (
                        <>
                            <Form form={props.form} />
                            <button
                                data-testid="form-save"
                                onClick={() =>
                                    props.onSave({ name: 'New Board', description: 'New desc' })
                                }
                            />
                            <button data-testid="form-cancel" onClick={props.onCancel} />
                            <button data-testid="form-delete" onClick={props.onDelete} />
                        </>
                    ) : null}
                </div>
            );
        },
    };
});
jest.mock('../Hotkeys', () => ({
    __esModule: true,
    default: ({ onKeyDown, keyName }: any) => {
        (global as any).__hotkeys = onKeyDown;
        return <div data-testid="hotkeys" data-keyname={keyName} />;
    },
}));

jest.mock('../../../components/common/Search/Search', () => ({
    Search: ({
        setSearchStr,
        tags,
        enabled,
        searchStr,
        regex,
        onRegexToggle,
        regexInvalid,
    }: any) => {
        (global as any).__searchProps = {
            setSearchStr,
            tags,
            enabled,
            searchStr,
            regex,
            onRegexToggle,
            regexInvalid,
        };
        return <div data-testid="search" data-enabled={String(enabled)} />;
    },
}));

jest.mock('../feedback', () => ({
    feedback: { toast: jest.fn() },
    FEEDBACK_MESSAGES: {
        kanban: { paused: 'paused', startFocusing: 'start focusing' },
    },
}));

const board = {
    _id: 'b1',
    name: 'Board One',
    createdTime: 1700000000000,
    description: 'Description',
    lists: ['l1'],
    focusedList: 'l1',
    doneList: 'l2',
    spentHours: 0,
    relatedSessions: [],
    pin: false,
};

const baseState = {
    boards: { b1: board },
    lists: {},
    cards: {},
};

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
    const view = render(<Kanban {...setup.props} />);
    return { ...view, ...setup };
};

describe('Kanban page', () => {
    afterEach(() => {
        cleanup();
        delete (global as any).__formProps;
        delete (global as any).__hotkeys;
        delete (global as any).__searchProps;
        delete (global as any).__boardMounts;
        dragActivity.dragging = false;
        jest.clearAllTimers();
    });

    it('fetches boards and shows the overview without a chosen board', () => {
        const { getByText, getByTestId, actions, queryByTestId } = renderKanban();

        expect(actions.fetchBoards).toHaveBeenCalledTimes(1);
        expect(getByText('Kanban Boards Overview')).toBeTruthy();
        expect(getByTestId('overview')).toBeTruthy();
        expect(queryByTestId('board')).toBeNull();
    });

    it('opens the empty board form from the create button', () => {
        const { getByRole, getByTestId } = renderKanban();

        fireEvent.click(getByRole('button', { name: 'Create a new board' }));

        expect(getByTestId('board-form').getAttribute('data-creating')).toBe('true');
        expect((global as any).__formProps.visible).toBe(true);
    });

    it('creates a board and closes the form', async () => {
        jest.useFakeTimers();
        const { getByRole, getByTestId, actions } = renderKanban();

        fireEvent.click(getByRole('button', { name: 'Create a new board' }));
        fireEvent.click(getByTestId('form-save'));

        expect(actions.addBoard).toHaveBeenCalledWith(expect.any(String), 'New Board', 'New desc');
        expect(actions.addBoard.mock.calls[0][0]).toMatch(/^[\w-]+$/);

        await act(async () => {
            jest.advanceTimersByTime(250);
        });
        expect((global as any).__formProps.visible).toBe(false);

        jest.useRealTimers();
    });

    it('cancels the board form', () => {
        const { getByRole, getByTestId } = renderKanban();

        fireEvent.click(getByRole('button', { name: 'Create a new board' }));
        fireEvent.click(getByTestId('form-cancel'));

        expect((global as any).__formProps.visible).toBe(false);
    });

    it('shows the chosen board, its created time and goes back', () => {
        const { getByText, container, actions } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        expect(getByText('Board One')).toBeTruthy();
        expect(container.textContent).toContain('Created:');
        expect((global as any).__hotkeys).toBeDefined();

        fireEvent.click(container.querySelectorAll('button')[0]);
        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
    });

    it('starts focusing on the chosen board and pauses it when it is already running', () => {
        const { getByTestId, actions, timerManager } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });
        const { feedback } = require('../feedback');

        fireEvent.click(getByTestId('play-pause'));
        expect(actions.focusOn).toHaveBeenCalledWith('b1');
        expect(timerManager.start).toHaveBeenCalledWith('b1');
        expect(feedback.toast).toHaveBeenLastCalledWith({
            kind: 'success',
            content: 'start focusing',
        });

        cleanup();
        const paused = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
            isFocusingOnChosenBoard: true,
            isTimerRunning: true,
        });

        fireEvent.click(paused.getByTestId('play-pause'));
        expect(paused.timerManager.pause).toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenLastCalledWith({
            kind: 'info',
            content: 'paused',
        });
    });

    it('toggles the sort direction and shows the board view controls', () => {
        const { getByRole, actions } = renderKanban();

        fireEvent.click(getByRole('button', { name: 'Ascending' }));
        expect(actions.setSortDirection).toHaveBeenCalledWith('desc');

        cleanup();
        const chosen = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        expect(chosen.getByTestId('search')).toBeTruthy();
        expect(chosen.getByTestId('board')).toBeTruthy();
        expect(chosen.getByTestId('play-pause').getAttribute('data-play')).toBe('true');
    });

    it('edits the chosen board through the settings form', () => {
        const { getByRole, getByTestId, actions } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        fireEvent.click(getByRole('button', { name: 'Edit board' }));
        expect((global as any).__formProps.isCreating).toBe(false);
        expect((global as any).__formProps.createdTime).toBe(board.createdTime);

        fireEvent.click(getByTestId('form-save'));
        expect(actions.editBoard).toHaveBeenCalledWith('b1', 'New Board', 'New desc', false);
    });

    it('deletes the chosen board from the settings form', () => {
        const { getByRole, getByTestId, actions } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        fireEvent.click(getByRole('button', { name: 'Edit board' }));
        fireEvent.click(getByTestId('form-delete'));

        expect(actions.deleteBoard).toHaveBeenCalledWith('b1');
    });

    it('handles the page hotkeys', () => {
        const { actions } = renderKanban();
        const handler = (global as any).__hotkeys;

        act(() => handler('ctrl+n'));
        expect((global as any).__formProps.visible).toBe(true);

        act(() => handler('esc'));
        expect(actions.changeAppTab).toHaveBeenCalledWith('timer');
    });

    it('goes back to the overview instead of leaving the page on esc', () => {
        const { actions } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        act(() => (global as any).__hotkeys('esc'));

        expect(actions.setChosenBoardId).toHaveBeenCalledWith(undefined);
        expect(actions.changeAppTab).not.toHaveBeenCalled();
    });

    it('leaves esc to the fullscreen record overlay', () => {
        const { actions } = renderKanban({
            chosenRecord: { _id: 'record' },
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });

        act(() => (global as any).__hotkeys('esc'));

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
            },
        });

        expect(actions.setSearchReg).toHaveBeenCalledWith(undefined);
        expect(actions.setSearchRegex).toHaveBeenCalledWith(false);
        expect((global as any).__searchProps.enabled).toBe(false);
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

        expect((global as any).__searchProps.regex).toBe(true);
        expect((global as any).__searchProps.onRegexToggle).toBe(actions.setSearchRegex);
        // '(' only fails to compile once the query is a regular expression.
        expect((global as any).__searchProps.regexInvalid).toBe(true);
    });

    // Regression: a drag still running when the page was switched away never
    // reached dnd's onDragEnd, so its pointer-events: none styles stayed on
    // every card -- the pointer fell back to the default cursor and dragging
    // was dead until the board was remounted by hand (leave and re-enter).
    it('drops a drag lost to a page switch and rebuilds the board', () => {
        dragActivity.dragging = true;
        const { props, rerender } = renderKanban({
            kanban: {
                chosenBoardId: 'b1',
                configuringBoardId: undefined,
                sortedBy: 'recent',
                sortDirection: 'asc',
            },
        });
        const mounts = (global as any).__boardMounts;

        rerender(<Kanban {...props} currentTab="timer" />);

        expect(dragActivity.dragging).toBe(false);
        expect((global as any).__boardMounts).toBe(mounts + 1);
    });
});

describe('Kanban overview header', () => {
    afterEach(() => {
        cleanup();
        jest.clearAllTimers();
    });

    it('switches the overview between the board grid and the table', () => {
        const { getByRole, getByTestId } = renderKanban();
        expect(getByTestId('overview').getAttribute('data-table')).toBe('false');

        fireEvent.click(getByRole('radio', { name: 'Table' }));
        expect(getByTestId('overview').getAttribute('data-table')).toBe('true');

        fireEvent.click(getByRole('radio', { name: 'Board' }));
        expect(getByTestId('overview').getAttribute('data-table')).toBe('false');
    });

    // Regression: the icon-only segments got their name from the icon itself
    // ("eye", "appstore") until each label carried an explicit aria-label, so
    // the control was unusable without sight.
    it('names the visibility segments after the boards they show', () => {
        const hidden = { ...board, _id: 'b2', name: 'Board Two', hidden: true };
        const { getByRole, getByTestId } = renderKanban({
            boards: { b1: board, b2: hidden },
        });

        expect(getByTestId('overview').getAttribute('data-hidden')).toBe('false');
        fireEvent.click(getByRole('radio', { name: 'Hidden (1)' }));

        expect(getByTestId('overview').getAttribute('data-hidden')).toBe('true');
    });

    it('keeps the hidden segment usable when nothing is hidden', () => {
        const { getByRole, getByTestId } = renderKanban();

        fireEvent.click(getByRole('radio', { name: 'Hidden (0)' }));

        // The empty state is reachable instead of the segment going dead.
        expect(getByTestId('overview').getAttribute('data-hidden')).toBe('true');
    });
});
