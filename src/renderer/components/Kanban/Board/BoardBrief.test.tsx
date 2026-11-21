import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { BoardBrief, TREND_HOVER_DELAY_MS, TREND_UNMOUNT_DELAY_MS } from './BoardBrief';
import { FeedbackContextBridge } from '../../feedback/Feedback';
import { FEEDBACK_MESSAGES } from '../../feedback';
import { aggregateBoardRows } from './tableAggregation';
import { accuracyGrade } from './accuracy';
import { t } from '../../../i18n';
import dbs from '../../../dbs';
import { uid } from '../../../../utils/uid';

/**
 * Everything here runs the real implementations: the play button, the pin, the
 * time badge, the list bar, the trend sparkline and the feedback layer. Only
 * the in-memory SQLite bridge (installed by the Jest setup) stands in for the
 * main process, which is the boundary the testing guide allows.
 *
 * The store uses an identity reducer: the card only reads the state this test
 * hands it, so what is asserted is the actions it dispatches and the rows those
 * actions write -- not a reduced state the test would have to reconstruct.
 */

const board = (id: string, overrides: any = {}) => ({
    _id: id,
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
    ...overrides,
});

const lists = {
    todo: { _id: 'todo', title: 'Todo', cards: ['todo-card'] },
    done: { _id: 'done', title: 'Done', cards: ['done-card'] },
};

interface RenderOptions {
    todo?: any;
    done?: any;
    cards?: any;
    lists?: any;
    board?: any;
    timer?: any;
    boardId?: string;
    onSettingClick?: (id: string) => void;
}

const renderBrief = (options: RenderOptions = {}) => {
    const boardId = options.boardId ?? uid();
    const state = {
        kanban: {
            boards: { [boardId]: board(boardId, options.board) },
            lists: options.lists ?? lists,
            cards: options.cards ?? {
                'todo-card': {
                    _id: 'todo-card',
                    spentTimeInHour: options.todo ?? { estimated: 2, actual: 1 },
                },
                'done-card': {
                    _id: 'done-card',
                    spentTimeInHour: options.done ?? { estimated: 4, actual: 2 },
                },
            },
        },
        timer: {
            boardId,
            isRunning: false,
            isFocusing: true,
            timerManager: { start: jest.fn(), pause: jest.fn() },
            ...options.timer,
        },
    };
    const store = createStore((value: any) => value, state);
    const dispatch = jest.spyOn(store, 'dispatch');
    const view = render(
        // Feedback renders through antd's App context; without it the real
        // toast layer throws instead of showing anything.
        <AntdApp>
            <FeedbackContextBridge />
            <Provider store={store}>
                <BoardBrief
                    boardId={boardId}
                    onSettingClick={options.onSettingClick ?? jest.fn()}
                />
            </Provider>
        </AntdApp>
    );
    return { ...view, store, dispatch, boardId, timerManager: state.timer.timerManager };
};

/** The trend chart is decorative SVG, so its accessible name is the handle. */
const trendChart = (query: { queryByRole: any }) =>
    query.queryByRole('img', { name: t('chart.trend') });

/**
 * Advances the hover/idle timers and then lets the sparkline's session query
 * settle. The query is a promise over the in-memory database, so it has to
 * finish inside act() -- otherwise its state update lands after the test and
 * the console gate fails the suite.
 */
const nativeSetImmediate: (callback: () => void) => unknown =
    jest.requireActual('timers').setImmediate;

const advance = async (ms: number) => {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
    await act(async () => {
        await new Promise<void>((resolve) => nativeSetImmediate(() => resolve()));
    });
};

describe('BoardBrief', () => {
    afterEach(async () => {
        jest.useRealTimers();
        cleanup();
        // Let the sparkline's session query settle inside act, so its state
        // update does not land after the test ended.
        await act(async () => undefined);
    });

    it('shows the board total and its remaining estimate', () => {
        const { getByText, getByTitle } = renderBrief();

        // TimeBadge prints both halves as text: 3h board total, 1h left.
        expect(getByText('03h 00m')).toBeTruthy();
        expect(getByText('01h 00m')).toBeTruthy();
        expect(getByTitle(t('kanban.brief.accuracy')).textContent).toBe('A-');
        // The description is Markdown: the bold run is its own text node.
        expect(getByText('bold')).toBeTruthy();
    });

    // Regression: rendering the whole description at its natural height made
    // one card taller than its neighbours. The row is clipped to one line in
    // CSS (jsdom has no layout); the full text stays in the tooltip.
    it('keeps the whole description in the tooltip', () => {
        const description = 'first paragraph\n\nsecond paragraph';
        const { getByText, getByTitle } = renderBrief({
            board: { description },
        });

        expect(getByText('first paragraph')).toBeTruthy();
        expect(getByTitle(/first paragraph/).getAttribute('title')).toBe(
            'first paragraph second paragraph'
        );
    });

    // Regression: the spent badge used to add up the cards' `actual`, so a
    // pomodoro that was never assigned to a card -- or whose card was deleted
    // -- was missing here while the pomodoro count still included it.
    it('counts unassigned pomodoros in the spent time', () => {
        const { getByText, queryByText } = renderBrief({ board: { spentHours: 5 } });

        expect(getByText('05h 00m')).toBeTruthy();
        // The cards alone add up to 3h; that number must not be shown.
        expect(queryByText('03h 00m')).toBeNull();
    });

    // 5 grades over the error brackets; the brackets themselves are unchanged,
    // so the letters must move together with the error below.
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
        const { queryByTitle, getByText } = renderBrief({
            done: { estimated: 0, actual: 0 },
        });

        expect(queryByTitle(t('kanban.brief.accuracy'))).toBeNull();
        expect(getByText('03h 00m')).toBeTruthy();
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
        const { getByTitle, boardId } = renderBrief({
            lists: listsWithTwoDone,
            cards: cardsById,
        });

        const [row] = aggregateBoardRows(
            { [boardId]: board(boardId) } as any,
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

    // Regression: the chart used to mount and run its session query as soon as
    // the pointer touched a card, so sweeping across the grid issued one query
    // per card. It now waits for a dwell, and stays mounted afterwards.
    it('mounts the trend chart after the pointer dwells and keeps it for later hovers', async () => {
        jest.useFakeTimers();
        const { container, queryByRole } = renderBrief();

        expect(trendChart({ queryByRole })).toBeNull();

        const card = container.querySelector('[data-tour="kanban-brief-card"]')!;
        fireEvent.mouseEnter(card);
        expect(trendChart({ queryByRole })).toBeNull();

        await advance(TREND_HOVER_DELAY_MS);
        expect(trendChart({ queryByRole })).toBeTruthy();

        fireEvent.mouseLeave(card);
        expect(trendChart({ queryByRole })).toBeTruthy();
    });

    // Regression: every visited card kept an SVG, a gradient and 30 data points
    // in the DOM for the lifetime of the overview.
    it('unmounts the chart after a long idle and remounts it on the next hover', async () => {
        jest.useFakeTimers();
        const { container, queryByRole } = renderBrief();
        const card = container.querySelector('[data-tour="kanban-brief-card"]')!;

        fireEvent.mouseEnter(card);
        await advance(TREND_HOVER_DELAY_MS);
        fireEvent.mouseLeave(card);

        // Leaving keeps the (invisible) chart for a while, so coming back
        // immediately is instant.
        expect(trendChart({ queryByRole })).toBeTruthy();

        await advance(TREND_UNMOUNT_DELAY_MS);
        expect(trendChart({ queryByRole })).toBeNull();

        fireEvent.mouseEnter(card);
        await advance(TREND_HOVER_DELAY_MS);
        expect(trendChart({ queryByRole })).toBeTruthy();
    });

    // Regression: the idle-unmount timer used to stay armed when the pointer
    // came back, so the chart vanished while the pointer was still on the card.
    it('cancels the idle unmount when the pointer returns', async () => {
        jest.useFakeTimers();
        const { container, queryByRole } = renderBrief();
        const card = container.querySelector('[data-tour="kanban-brief-card"]')!;

        fireEvent.mouseEnter(card);
        await advance(TREND_HOVER_DELAY_MS);
        fireEvent.mouseLeave(card);
        await advance(TREND_UNMOUNT_DELAY_MS - 1);
        fireEvent.mouseEnter(card);
        await advance(TREND_UNMOUNT_DELAY_MS);

        expect(trendChart({ queryByRole })).toBeTruthy();
    });

    it('does not mount the trend chart when the pointer only sweeps past', async () => {
        jest.useFakeTimers();
        const { container, queryByRole } = renderBrief();

        const card = container.querySelector('[data-tour="kanban-brief-card"]')!;
        fireEvent.mouseEnter(card);
        fireEvent.mouseLeave(card);
        await advance(TREND_HOVER_DELAY_MS * 2);

        expect(trendChart({ queryByRole })).toBeNull();
    });

    it('starts focusing on this board', async () => {
        const { getByLabelText, dispatch, timerManager, boardId } = renderBrief();

        fireEvent.click(getByLabelText(t('timer.tray.startFocusing')));

        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ type: '[Timer]SET_BOARD_ID', payload: { boardId } })
        );
        expect(timerManager.start).toHaveBeenCalledWith(boardId);
        expect(await screen.findByText(FEEDBACK_MESSAGES.kanban.startFocusing)).toBeTruthy();
    });

    it('pauses instead of starting when this board is already being focused', async () => {
        const { getByLabelText, timerManager } = renderBrief({
            timer: { isRunning: true },
        });

        // The button shows the action it will perform: pause, not play.
        fireEvent.click(getByLabelText(t('timer.tray.pause')));

        expect(timerManager.pause).toHaveBeenCalled();
        expect(timerManager.start).not.toHaveBeenCalled();
        expect(await screen.findByText(FEEDBACK_MESSAGES.kanban.paused)).toBeTruthy();
    });

    it('opens the board settings through the gear button', () => {
        const onSettingClick = jest.fn();
        const { getByLabelText, dispatch, boardId } = renderBrief({ onSettingClick });

        fireEvent.click(getByLabelText(t('kanban.page.boardSettings')));

        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: '[KANBAN]CONFIGURING_BOARD_ID',
                payload: { _id: boardId },
            })
        );
        expect(onSettingClick).toHaveBeenCalledWith(boardId);
    });

    // The pin's visible state is a CSS class, so the assertion is the row it
    // writes: clicking the pin has to persist it.
    it('persists the pin when it is toggled', async () => {
        const boardId = uid();
        await dbs.kanbanDB.insert(board(boardId));
        const { container, dispatch } = renderBrief({ boardId });

        fireEvent.click(container.querySelector('.pl-pin')!);

        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: '[Board]SET_PIN',
                payload: { _id: boardId, pin: true },
            })
        );
        await waitFor(async () => {
            expect(await dbs.kanbanDB.findOne({ _id: boardId })).toMatchObject({ pin: true });
        });
    });
});
