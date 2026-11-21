import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { BoardBrief, TREND_HOVER_DELAY_MS, TREND_UNMOUNT_DELAY_MS } from './BoardBrief';
import { actions } from './action';
import { actions as kanbanActions } from '../action';
import { actions as timerActions } from '../../Timer/action';
import { aggregateBoardRows } from './tableAggregation';
import { accuracyGrade } from './accuracy';
import { t } from '../../../i18n';

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
    // The readout renders for real: its grade is what the user sees, and the
    // tooltip is the only handle the test needs. Only TimeBadge is replaced,
    // because its hours live inside an SVG.
    ...jest.requireActual('../../../../components/Visualization/Badge/Badge'),
    TimeBadge: ({ spentTime, leftTime }: any) => (
        <span data-testid="time-badge">{`spent-${spentTime}-left-${leftTime}`}</span>
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
    // The two cards below carry 1h and 2h; the board total is session-level.
    spentHours: 3,
    relatedSessions: [{ _id: 'session' }],
    pin: false,
});

const lists = {
    todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
    done: { _id: 'done', title: 'Done', cards: ['done-card'] },
};

const renderBrief = (overrides: any = {}, timerOverrides: any = {}, boardOverrides: any = {}) => {
    const state = {
        kanban: {
            boards: { b1: { ...board(), ...boardOverrides } },
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

    it('shows the board total and its remaining estimate', () => {
        const { getByTestId, getByTitle, container } = renderBrief();

        expect(getByTestId('time-badge').textContent).toBe('spent-3-left-1');
        expect(getByTitle(t('kanban.brief.accuracy')).textContent).toBe('A-');
        expect(container.querySelector('strong')?.textContent).toBe('bold');
    });

    // Regression: the spent badge used to add up the cards' `actual`, so a
    // pomodoro that was never assigned to a card -- or whose card was deleted
    // -- was missing here while the pomodoro count still included it.
    it('counts unassigned pomodoros in the spent time', () => {
        const { getByTestId } = renderBrief({}, {}, { spentHours: 5 });

        expect(getByTestId('time-badge').textContent).toBe('spent-5-left-1');
    });

    // 5 grades over the existing error brackets; the brackets themselves are
    // unchanged, so the letters must move together with the numbers below.
    it.each([
        ['SSS', { estimated: 2, actual: 2 }],
        ['S', { estimated: 16, actual: 15 }],
        ['A+', { estimated: 16, actual: 14 }],
        ['A', { estimated: 5, actual: 4 }],
        ['A-', { estimated: 10, actual: 2 }],
    ])('grades a done card %s', (text, done) => {
        const { getByTitle } = renderBrief({ done });

        expect(getByTitle(t('kanban.brief.accuracy')).textContent).toBe(text);
    });

    it('hides the accuracy badge when a done card has no time', () => {
        const { queryByTitle, getByTestId } = renderBrief({
            done: { estimated: 0, actual: 0 },
        });

        expect(queryByTitle(t('kanban.brief.accuracy'))).toBeNull();
        expect(getByTestId('time-badge').textContent).toBe('spent-3-left-1');
    });

    // Regression: the card and the table column each carried their own copy of
    // the error formula, so the same board could be graded from one mean and
    // sorted by another. The second done card has no times: it is rated as 0
    // but still widens the denominator, which is the case where a second
    // formula or a different denominator drifts first.
    it('grades the same mean error the table aggregates', () => {
        const listsWithTwoDone = {
            todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
            done: { _id: 'done', title: 'Done', cards: ['done-a', 'done-b'] },
        };
        const cardsById = {
            'todo-card': { _id: 'todo-card', spentTimeInHour: { estimated: 2, actual: 1 } },
            'done-a': { _id: 'done-a', spentTimeInHour: { estimated: 3, actual: 2 } },
            'done-b': { _id: 'done-b', spentTimeInHour: { estimated: 0, actual: 0 } },
        };
        const store = createStore((value: any) => value, {
            kanban: { boards: { b1: board() }, lists: listsWithTwoDone, cards: cardsById },
            timer: { boardId: 'b1', isRunning: false, isFocusing: true, timerManager: undefined },
        });
        const { getByTitle } = render(
            <Provider store={store}>
                <BoardBrief boardId="b1" onSettingClick={jest.fn()} />
            </Provider>
        );

        const [row] = aggregateBoardRows(
            { b1: board() } as any,
            listsWithTwoDone as any,
            cardsById as any
        );
        const meanError = row.meanPercentageError as number;

        // Both sides in the value: a failure shows the mean the table
        // aggregated next to the grade the card rendered.
        expect({
            grade: getByTitle(t('kanban.brief.accuracy')).textContent,
            meanError,
        }).toEqual({ grade: accuracyGrade(meanError), meanError });
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

    it('unmounts the chart after a long idle and remounts it without replaying the reveal', () => {
        jest.useFakeTimers();
        try {
            const { getByTestId, queryByTestId, container } = renderBrief();
            const card = container.querySelector('[data-tour="kanban-brief-card"]')!;

            fireEvent.mouseEnter(card);
            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS);
            });
            fireEvent.animationEnd(getByTestId('trend-cover'));
            fireEvent.mouseLeave(card);

            // Leaving keeps the (invisible) chart for a while, so coming back
            // immediately is instant.
            expect(queryByTestId('trend')).not.toBeNull();

            act(() => {
                jest.advanceTimersByTime(TREND_UNMOUNT_DELAY_MS);
            });
            expect(queryByTestId('trend')).toBeNull();

            fireEvent.mouseEnter(card);
            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS);
            });
            expect(queryByTestId('trend')).not.toBeNull();
            // The reveal is a first-run affordance; it must not play again.
            expect(queryByTestId('trend-cover')).toBeNull();
        } finally {
            jest.useRealTimers();
        }
    });

    it('cancels the idle unmount when the pointer returns', () => {
        jest.useFakeTimers();
        try {
            const { getByTestId, queryByTestId, container } = renderBrief();
            const card = container.querySelector('[data-tour="kanban-brief-card"]')!;

            fireEvent.mouseEnter(card);
            act(() => {
                jest.advanceTimersByTime(TREND_HOVER_DELAY_MS);
            });
            fireEvent.mouseLeave(card);
            act(() => {
                jest.advanceTimersByTime(TREND_UNMOUNT_DELAY_MS - 1);
            });
            fireEvent.mouseEnter(card);
            act(() => {
                jest.advanceTimersByTime(TREND_UNMOUNT_DELAY_MS);
            });

            expect(queryByTestId('trend')).not.toBeNull();
            expect(getByTestId('trend-animation')).toBeTruthy();
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
