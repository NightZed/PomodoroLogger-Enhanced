import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { TimerMask } from './SessionEndingMask';
import { SESSION_MASK_LAYER_ID } from '../popupLayer';
import { DAY_THEME_ID } from '../../theme/tokens';
import { t } from '../../i18n';

jest.mock('./action', () => ({
    actions: {
        setBoardId: (boardId?: string) => ({ type: 'SET_BOARD_ID', payload: { boardId } }),
    },
    LONG_BREAK_INTERVAL: 4,
}));

jest.mock('./PomodoroNumView', () => ({
    PomodoroNumView: () => <div>pomodoro-num</div>,
}));

const boards = {
    b1: { _id: 'b1', name: 'Project One', lists: ['l1'], focusedList: 'l1' },
    b2: { _id: 'b2', name: 'Project Two', lists: [], focusedList: 'l2' },
};

const lists = {
    l1: { _id: 'l1', title: 'Todo', cards: ['c1'] as string[] },
    l2: { _id: 'l2', title: 'Doing', cards: [] as string[] },
};

const cards = {
    c1: { _id: 'c1', title: 'Card One' },
    c2: { _id: 'c2', title: 'Card Two' },
};

const state = {
    timer: {
        isFocusing: true,
        iBreak: 0,
        boardId: 'b1',
        compact: false,
        themeId: DAY_THEME_ID,
    },
    kanban: { boards, lists, cards },
};

const renderMask = (
    props: Partial<React.ComponentProps<typeof TimerMask>> = {},
    timer: Partial<typeof state.timer> = {},
    kanban: Partial<typeof state.kanban> = {}
) => {
    // Mirrors the one reducer case the mask can dispatch: picking a project on
    // the mask changes the focusing selection, like `timer.boardId` does.
    const store = createStore(
        (value: any, action: any) =>
            action?.type === 'SET_BOARD_ID'
                ? { ...value, timer: { ...value.timer, boardId: action.payload.boardId } }
                : value,
        {
            ...state,
            timer: { ...state.timer, ...timer },
            kanban: { ...state.kanban, ...kanban },
        }
    );
    const view = render(
        <Provider store={store}>
            <TimerMask
                showMask
                onCancel={jest.fn()}
                onStart={jest.fn()}
                pomodoros={[]}
                extendCurrentSession={jest.fn()}
                {...props}
            />
        </Provider>
    );
    return { ...view, store };
};

/** The mask itself; a click on it is a click on the empty background. */
const clickBackground = (view: ReturnType<typeof renderMask>) =>
    fireEvent.click(view.getByRole('group', { name: 'Session ending' }));

/**
 * The card selector, found by its accessible name rather than by its position
 * in the edit state. antd opens a Select on `mousedown` and the repo has no
 * `@testing-library/user-event`, so the tests replay that event directly (same
 * as `FocusSelector.test.tsx`).
 */
const cardSelector = (view: ReturnType<typeof renderMask>) =>
    view.getByRole('combobox', { name: 'Choose a card' });

describe('TimerMask', () => {
    afterEach(cleanup);

    it('shows the selected project and starts the next focus session', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart });

        expect(view.getByText('Project One')).toBeTruthy();
        expect(view.getByText('Session Finished')).toBeTruthy();
        expect(view.getByText('pomodoro-num')).toBeTruthy();
        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();
        expect(view.queryByText('Choose Your Focus')).toBeNull();

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));

        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('keeps a session without a project open when the background is clicked', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, { boardId: undefined });

        // The empty heading has no line box, so the trigger needs its own copy.
        expect(view.getByText('Choose Your Focus')).toBeTruthy();

        clickBackground(view);

        expect(onCancel).not.toHaveBeenCalled();
    });

    it('renders the same project selector as the timer page', () => {
        const view = renderMask({}, { boardId: undefined });

        // Same antd Select as `FocusSelector` on the timer page, including its
        // untouched state copy.
        expect(view.queryByRole('combobox')).not.toBeNull();
        expect(view.getByText('Choose Your Focus')).toBeTruthy();
        expect(view.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    });

    it('unlocks the background from the Confirm button without closing the mask', () => {
        const onCancel = jest.fn();
        const onStart = jest.fn();
        const view = renderMask({ onCancel, onStart }, { boardId: undefined });

        fireEvent.click(view.getByRole('button', { name: 'Confirm' }));

        // Confirm only releases the lock: the session is not confirmed yet.
        expect(onCancel).not.toHaveBeenCalled();
        expect(onStart).not.toHaveBeenCalled();
        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();

        // Unlocked, the background click saves and closes as it used to.
        clickBackground(view);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('switches to the project name and unlocks once one is picked', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, { boardId: undefined });

        act(() => {
            view.store.dispatch({ type: 'SET_BOARD_ID', payload: { boardId: 'b2' } });
        });

        // A chosen project replaces the selector with the big name, and the
        // background is dismissible again without a separate acknowledgement.
        expect(view.queryByRole('combobox')).toBeNull();
        expect(view.getByRole('heading', { name: 'Project Two' })).toBeTruthy();
        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();

        clickBackground(view);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('swaps the name heading back to the selector when it is clicked', () => {
        const view = renderMask({}, { boardId: 'b1' });

        expect(view.queryByRole('combobox')).toBeNull();

        fireEvent.click(view.getByText('Project One'));

        expect(view.queryByRole('combobox')).not.toBeNull();
    });

    it('puts the name heading back when the background is clicked while editing', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, { boardId: 'b1' });

        fireEvent.click(view.getByText('Project One'));
        expect(view.queryByRole('combobox')).not.toBeNull();

        clickBackground(view);

        // The first click only leaves edit mode; the mask stays open.
        expect(onCancel).not.toHaveBeenCalled();
        expect(view.queryByRole('combobox')).toBeNull();
        expect(view.getByText('Project One')).toBeTruthy();
    });

    it('dismisses a break session from the background without a Confirm button', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, { isFocusing: false, boardId: undefined });

        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();

        clickBackground(view);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('extends a running focus session by five or ten minutes', () => {
        const extendCurrentSession = jest.fn();
        const view = renderMask({ extendCurrentSession });

        fireEvent.click(view.getByRole('button', { name: 'Extend 5 minutes' }));
        fireEvent.click(view.getByRole('button', { name: 'Extend 10 minutes' }));

        expect(extendCurrentSession.mock.calls).toEqual([[5], [10]]);
    });

    it('shows the break copy and hides the extend buttons during a break', () => {
        const view = renderMask({}, { isFocusing: false });

        expect(view.getByText('Break')).toBeTruthy();
        expect(view.getByRole('button', { name: /Start Focusing/ })).toBeTruthy();
        expect(view.queryByTitle('Extend 5 minutes')).toBeNull();
    });

    it('counts the pomodoros of the day next to the headline', () => {
        const view = renderMask({
            pomodoros: [{ _id: 'p1' } as any, { _id: 'p2' } as any],
            newPomodoro: { _id: 'p3' } as any,
        });

        // The dot row below draws the stored sessions plus the one waiting for
        // confirmation; the headline counts the same set, so the two cannot
        // disagree.
        expect(
            view.getByRole('heading', {
                level: 1,
                name: `${t('timer.session.todayPomodoros')} 3`,
            })
        ).toBeTruthy();
    });
});

describe('TimerMask mount point', () => {
    afterEach(cleanup);

    // Regression: the mask used to render inside the Timer page's pane, so a
    // finished session could only be seen after forcing the window back to
    // that page. That page switch closed an open card editor and interrupted a
    // drag, leaving dnd's pointer-events:none styles behind.
    it('renders into the app-level mask layer instead of the page', () => {
        const layer = document.createElement('div');
        layer.id = SESSION_MASK_LAYER_ID;
        document.body.appendChild(layer);

        const view = renderMask();
        const mask = view.getByRole('group', { name: 'Session ending' });

        expect(layer.contains(mask)).toBe(true);
        layer.remove();
    });
});

/**
 * Structural proxies, not behaviour: jsdom computes no stacking, so "which one
 * paints on top" cannot be asserted here. These two guard the fix itself --
 * the menus being mounted inside the mask; visibility still needs a manual
 * check, and the order it relies on is pinned by `layers.test.ts`.
 */
describe('TimerMask select menus', () => {
    afterEach(cleanup);

    // Regression: f7077c8 moved the mask into the app-level layer and raised
    // it to 1100, while antd mounts select menus in the shared popup layer
    // (1050). The project menu therefore painted underneath the mask.
    it('mounts the project menu inside the mask', () => {
        const view = renderMask({}, { boardId: 'b1' });

        fireEvent.click(view.getByText('Project One'));
        fireEvent.mouseDown(view.getByRole('combobox'));

        const mask = view.getByRole('group', { name: 'Session ending' });
        expect(mask.contains(view.getByText('Project Two'))).toBe(true);
    });

    it('mounts the card menu inside the mask', () => {
        const view = renderMask(
            {},
            {},
            {
                lists: {
                    l1: { _id: 'l1', title: 'Todo', cards: ['c1', 'c2'] },
                    l2: { _id: 'l2', title: 'Doing', cards: [] },
                },
            }
        );

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.mouseDown(cardSelector(view));

        const mask = view.getByRole('group', { name: 'Session ending' });
        expect(mask.contains(view.getByText('Card Two'))).toBe(true);
    });
});

describe('TimerMask card attribution', () => {
    afterEach(cleanup);

    // Two cards in the focused list: the only case where the mask asks.
    const twoCards = {
        lists: {
            l1: { _id: 'l1', title: 'Todo', cards: ['c1', 'c2'] },
            l2: { _id: 'l2', title: 'Doing', cards: [] },
        },
    };

    // Regression: a finished session used to be credited to every card in the
    // focused list, multiplying the card totals by the number of cards.
    it('credits the only card of the focused list without asking', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel });

        // One card needs no choice, so the mask stays uncluttered.
        expect(view.queryByRole('button', { name: 'Card One' })).toBeNull();

        clickBackground(view);
        expect(onCancel).toHaveBeenCalledWith('c1');
    });

    it('lets the mask pick one of several cards', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart }, {}, twoCards);

        // The card name opens the same edit state as the project name.
        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.mouseDown(cardSelector(view));
        fireEvent.click(view.getByText('Card Two'));

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));
        expect(onStart).toHaveBeenCalledWith('c2');
    });

    it('sends an explicit "no card" when the menu says so', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart }, {}, twoCards);

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.mouseDown(cardSelector(view));
        fireEvent.click(view.getByText('No card'));

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));
        // `null`, not `undefined`: the user chose "No card" on purpose, so the
        // Timer must not fall back to the focused list's first card.
        expect(onStart).toHaveBeenCalledWith(null);
    });

    it('shows how many cards can take the session', () => {
        const view = renderMask({}, {}, twoCards);

        expect(view.getByText('x 2')).toBeTruthy();
    });

    // Regression: the menu is opened from the edit state, so the first
    // background click leaves that state instead of confirming the session.
    it('dismisses the card selector without ending the session', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, {}, twoCards);

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.mouseDown(cardSelector(view));
        expect(view.getByText('Card Two')).toBeTruthy();

        clickBackground(view);

        expect(onCancel).not.toHaveBeenCalled();

        // The next click is an ordinary background click again.
        clickBackground(view);
        expect(onCancel).toHaveBeenCalledWith('c1');
    });

    it('keeps the card selector in the edit state', () => {
        const view = renderMask({}, {}, twoCards);

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));

        expect(cardSelector(view)).toBeTruthy();
    });

    it('leaves the edit state after picking a card', () => {
        const view = renderMask({}, {}, twoCards);

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.mouseDown(cardSelector(view));
        fireEvent.click(view.getByText('Card Two'));

        // The project name heading is back, exactly as after a project pick.
        expect(view.getByRole('heading', { name: 'Project One' })).toBeTruthy();
    });

    it('does not ask for a card when the focused list is empty', () => {
        const onCancel = jest.fn();
        const view = renderMask(
            { onCancel },
            {},
            {
                lists: {
                    l1: { _id: 'l1', title: 'Todo', cards: [] },
                    l2: { _id: 'l2', title: 'Doing', cards: [] },
                },
            }
        );

        // A placeholder, not a control: there is nothing to pick, but the
        // missing attribution is worth showing.
        expect(view.getByText('No card')).toBeTruthy();
        expect(view.queryByRole('button', { name: 'No card' })).toBeNull();

        clickBackground(view);
        // Nothing to credit: the session stays unattributed.
        expect(onCancel).toHaveBeenCalledWith(null);
    });
});
