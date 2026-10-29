import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { BoardBrief, TREND_HOVER_DELAY_MS } from './BoardBrief';
import { actions } from './action';
import { actions as kanbanActions } from '../action';
import { actions as timerActions } from '../../Timer/action';

jest.mock('./PlayPauseButton', () => ({
    PlayPauseButton: ({ onClick, showPlay }: any) => (
        <button data-testid="play-pause" data-play={String(showPlay)} onClick={onClick} />
    ),
}));
jest.mock('./action', () => ({ actions: { setPin: jest.fn() } }));
jest.mock('../action', () => ({ actions: { setConfiguringBoardId: jest.fn() } }));
jest.mock('../../Timer/action', () => ({ actions: { setBoardId: jest.fn() } }));
jest.mock('../../Visualization/ProjectTrend', () => ({
    IdTrend: () => <div data-testid="trend" />,
}));
jest.mock('../../Visualization/Bar', () => ({ ListsCountBar: () => null }));
jest.mock('../../../../components/Visualization/Badge/Badge', () => ({
    TimeBadge: ({ spentTime, leftTime }: any) => (
        <span data-testid="time-badge">{`spent-${spentTime}-left-${leftTime}`}</span>
    ),
    Badge: ({ value, color }: any) => (
        <span data-testid="accuracy-badge">{`${value}-${color}`}</span>
    ),
}));
jest.mock('../../../../components/common/Pin/Pin', () => ({
    Pin: ({ isPin, onClick }: any) => (
        <button data-testid="pin" data-pinned={String(!!isPin)} onClick={onClick} />
    ),
}));
jest.mock('../../feedback', () => ({
    feedback: { toast: jest.fn() },
    FEEDBACK_MESSAGES: { kanban: { paused: 'paused', startFocusing: 'starting' } },
}));

const board = () => ({
    _id: 'b1',
    name: 'Board One',
    description: 'A **bold** description',
    createdTime: 1700000000000,
    lists: ['todo', 'done'],
    focusedList: 'todo',
    doneList: 'done',
    spentHours: 0,
    relatedSessions: [{ _id: 'session' }],
    pin: false,
});

const lists = {
    todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
    done: { _id: 'done', title: 'Done', cards: ['done-card'] },
};

const renderBrief = (overrides: any = {}, timerOverrides: any = {}) => {
    const state = {
        kanban: {
            boards: { b1: board() },
            lists,
            cards: {
                'todo-card': {
                    _id: 'todo-card',
                    spentTimeInHour: overrides.todo ?? { estimated: 2, actual: 1 },
                },
                'done-card': {
                    _id: 'done-card',
                    spentTimeInHour: overrides.done ?? { estimated: 4, actual: 2 },
                },
            },
        },
        timer: {
            boardId: 'b1',
            isRunning: false,
            isFocusing: true,
            timerManager: { start: jest.fn(), pause: jest.fn() },
            ...timerOverrides,
        },
    };
    const store = createStore((value: any) => value, state);
    const dispatch = jest.spyOn(store, 'dispatch');
    const view = render(
        <Provider store={store}>
            <BoardBrief boardId="b1" onSettingClick={jest.fn()} />
        </Provider>
    );
    return { ...view, store, dispatch, timerManager: state.timer.timerManager };
};

describe('BoardBrief', () => {
    beforeEach(() => {
        (timerActions.setBoardId as unknown as jest.Mock).mockImplementation((id: string) => ({
            type: 'timer/setBoardId',
            id,
        }));
        (kanbanActions.setConfiguringBoardId as unknown as jest.Mock).mockImplementation(
            (id: string) => ({
                type: 'kanban/configuring',
                id,
            })
        );
        (actions.setPin as jest.Mock).mockImplementation(() => jest.fn());
    });

    afterEach(cleanup);

    it('sums spent and remaining time and rates the estimate', () => {
        const { getByTestId, container } = renderBrief();

        expect(getByTestId('time-badge').textContent).toBe('spent-3-left-1');
        expect(getByTestId('accuracy-badge').textContent).toBe('Bad-#ff350e');
        expect(container.querySelector('strong')?.textContent).toBe('bold');
    });

    it.each([
        ['Perfect', { estimated: 2, actual: 2 }],
        ['Good', { estimated: 16, actual: 15 }],
        ['Fair', { estimated: 16, actual: 14 }],
        ['Poor', { estimated: 5, actual: 4 }],
        ['Bad', { estimated: 10, actual: 2 }],
    ])('rates a done card with %s accuracy', (label, done) => {
        const { getByTestId } = renderBrief({ done });

        expect(getByTestId('accuracy-badge').textContent).toContain(label);
    });

    it('hides the accuracy badge when a done card has no time', () => {
        const { queryByTestId, getByTestId } = renderBrief({
            done: { estimated: 0, actual: 0 },
        });

        expect(queryByTestId('accuracy-badge')).toBeNull();
        expect(getByTestId('time-badge').textContent).toBe('spent-1-left-1');
    });

    it('mounts the trend chart after the pointer dwells and keeps it for later hovers', () => {
        jest.useFakeTimers();
        try {
            const { getByText, getByTestId, queryByTestId, container } = renderBrief();

            expect(queryByTestId('trend')).toBeNull();

            const card = container.querySelector('[data-tour="kanban-brief-card"]')!;
            fireEvent.mouseEnter(card);
            expect(queryByTestId('trend')).toBeNull();

            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS);
            });
            expect(queryByTestId('trend')).not.toBeNull();
            expect(getByText('Board One')).toBeTruthy();

            fireEvent.mouseLeave(card);
            expect(getByTestId('trend-animation').classList.contains('pl-trend')).toBe(true);
            expect(queryByTestId('trend')).not.toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not replay the trend reveal after it has finished', () => {
        jest.useFakeTimers();
        try {
            const { getByTestId, queryByTestId, container } = renderBrief();
            const card = container.querySelector('[data-tour="kanban-brief-card"]')!;

            fireEvent.mouseEnter(card);
            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS);
            });
            fireEvent.animationEnd(getByTestId('trend-cover'));
            expect(queryByTestId('trend-cover')).toBeNull();

            fireEvent.mouseLeave(card);
            fireEvent.mouseEnter(card);
            expect(queryByTestId('trend')).not.toBeNull();
            expect(queryByTestId('trend-cover')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not mount the trend chart when the pointer only sweeps past', () => {
        jest.useFakeTimers();
        try {
            const { queryByTestId, container } = renderBrief();

            const card = container.querySelector('[data-tour="kanban-brief-card"]')!;
            fireEvent.mouseEnter(card);
            fireEvent.mouseLeave(card);
            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS * 2);
            });

            expect(queryByTestId('trend')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('starts focusing on this board', () => {
        const { getByTestId, timerManager } = renderBrief();
        const { feedback } = require('../../feedback');

        fireEvent.click(getByTestId('play-pause'));

        expect(timerActions.setBoardId).toHaveBeenCalledWith('b1');
        expect(timerManager.start).toHaveBeenCalledWith('b1');
        expect(feedback.toast).toHaveBeenLastCalledWith({
            kind: 'success',
            content: 'starting',
        });
    });

    it('pauses instead of starting when this board is already being focused', () => {
        const { getByTestId, timerManager } = renderBrief({}, { isRunning: true });
        const { feedback } = require('../../feedback');

        expect(getByTestId('play-pause').getAttribute('data-play')).toBe('false');
        fireEvent.click(getByTestId('play-pause'));

        expect(timerManager.pause).toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenLastCalledWith({
            kind: 'info',
            content: 'paused',
        });
    });

    it('opens the board settings through the gear button', () => {
        const onSettingClick = jest.fn();
        const state = {
            kanban: {
                boards: { b1: board() },
                lists,
                cards: {},
            },
            timer: {
                boardId: undefined,
                isRunning: false,
                isFocusing: true,
                timerManager: undefined,
            },
        };
        const store = createStore((value: any) => value, state);
        const { container } = render(
            <Provider store={store}>
                <BoardBrief boardId="b1" onSettingClick={onSettingClick} />
            </Provider>
        );

        fireEvent.click(container.querySelector('[aria-label="setting"]')!.closest('button')!);

        expect(kanbanActions.setConfiguringBoardId).toHaveBeenCalledWith('b1');
        expect(onSettingClick).toHaveBeenCalledWith('b1');
    });

    it('toggles the pin', () => {
        const { getByTestId } = renderBrief();

        fireEvent.click(getByTestId('pin'));

        expect(actions.setPin).toHaveBeenCalledWith('b1', true);
    });
});
