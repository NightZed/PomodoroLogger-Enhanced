import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Kanban } from './Kanban';

jest.mock('./Board', () => ({ __esModule: true, default: () => <div data-testid="board" /> }));
jest.mock('./Board/Overview', () => ({
    Overview: ({ showConfigById, showTable }: any) => (
        <div data-testid="overview" data-table={String(showTable)}>
            <button data-testid="overview-configure" onClick={() => showConfigById('b1')} />
        </div>
    ),
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
    Search: ({ setSearchStr, tags, enabled, searchStr }: any) => {
        (global as any).__searchProps = { setSearchStr, tags, enabled, searchStr };
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

        fireEvent.click(getByRole('button', { name: 'plus' }));

        expect(getByTestId('board-form').getAttribute('data-creating')).toBe('true');
        expect((global as any).__formProps.visible).toBe(true);
    });

    it('creates a board and closes the form', async () => {
        jest.useFakeTimers();
        const { getByRole, getByTestId, actions } = renderKanban();

        fireEvent.click(getByRole('button', { name: 'plus' }));
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

        fireEvent.click(getByRole('button', { name: 'plus' }));
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

        fireEvent.click(getByRole('button', { name: 'up' }));
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

        fireEvent.click(getByRole('button', { name: 'setting' }));
        expect((global as any).__formProps.isCreating).toBe(false);
        expect((global as any).__formProps.createdTime).toBe(board.createdTime);

        fireEvent.click(getByTestId('form-save'));
        expect(actions.editBoard).toHaveBeenCalledWith('b1', 'New Board', 'New desc');
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

        fireEvent.click(getByRole('button', { name: 'setting' }));
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
        expect((global as any).__searchProps.enabled).toBe(false);
    });
});
