import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { TimerMask } from './SessionEndingMask';
import { DAY_THEME_ID } from '../../theme/tokens';

jest.mock('./action', () => ({
    actions: {
        setBoardId: (boardId?: string) => ({ type: 'SET_BOARD_ID', payload: { boardId } }),
    },
    LONG_BREAK_INTERVAL: 4,
}));

jest.mock('./PomodoroNumView', () => ({
    PomodoroNumView: () => <div data-testid="pomodoro-num-view" />,
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

describe('TimerMask', () => {
    afterEach(cleanup);

    it('shows the selected project and starts the next focus session', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart });

        expect(view.getByText('Project One')).toBeTruthy();
        expect(view.getByText('Session Finished')).toBeTruthy();
        expect(view.getByTestId('pomodoro-num-view')).toBeTruthy();
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

        fireEvent.click(view.container.firstElementChild!);

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
        fireEvent.click(view.container.firstElementChild!);
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
        expect(view.container.querySelector('h1')?.textContent).toBe('Project Two');
        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();

        fireEvent.click(view.container.firstElementChild!);
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

        fireEvent.click(view.container.firstElementChild!);

        // The first click only leaves edit mode; the mask stays open.
        expect(onCancel).not.toHaveBeenCalled();
        expect(view.queryByRole('combobox')).toBeNull();
        expect(view.getByText('Project One')).toBeTruthy();
    });

    it('dismisses a break session from the background without a Confirm button', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel }, { isFocusing: false, boardId: undefined });

        expect(view.queryByRole('button', { name: 'Confirm' })).toBeNull();

        fireEvent.click(view.container.firstElementChild!);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('extends a running focus session by five or ten minutes', () => {
        const extendCurrentSession = jest.fn();
        const view = renderMask({ extendCurrentSession });

        fireEvent.click(view.getByTitle('Extend 5 minutes'));
        fireEvent.click(view.getByTitle('Extend 10 minutes'));

        expect(extendCurrentSession.mock.calls).toEqual([[5], [10]]);
    });

    it('shows the break copy and hides the extend buttons during a break', () => {
        const view = renderMask({}, { isFocusing: false });

        expect(view.getByText('Break')).toBeTruthy();
        expect(view.getByRole('button', { name: /Start Focusing/ })).toBeTruthy();
        expect(view.queryByTitle('Extend 5 minutes')).toBeNull();
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

    it('credits the only card of the focused list without asking', () => {
        const onCancel = jest.fn();
        const view = renderMask({ onCancel });

        // One card needs no choice, so the mask stays uncluttered.
        expect(view.queryByText(/^Card:/)).toBeNull();

        fireEvent.click(view.container.firstElementChild!);
        expect(onCancel).toHaveBeenCalledWith('c1');
    });

    it('lets the mask pick one of several cards', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart }, {}, twoCards);

        fireEvent.click(view.getByText('Card: Card One (of 2)'));
        fireEvent.click(view.getByRole('button', { name: 'Card: Card One' }));
        fireEvent.click(view.getByRole('button', { name: 'Card Two' }));

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));
        expect(onStart).toHaveBeenCalledWith('c2');
    });

    it('sends an explicit "no card" when the picker says so', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart }, {}, twoCards);

        fireEvent.click(view.getByText('Card: Card One (of 2)'));
        fireEvent.click(view.getByRole('button', { name: 'Card: Card One' }));
        fireEvent.click(view.getByRole('button', { name: 'No card' }));

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));
        // `null`, not `undefined`: the user chose "No card" on purpose, so the
        // Timer must not fall back to the focused list's first card.
        expect(onStart).toHaveBeenCalledWith(null);
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

        expect(view.queryByText(/^Card:/)).toBeNull();

        fireEvent.click(view.container.firstElementChild!);
        // Nothing to credit: the session stays unattributed.
        expect(onCancel).toHaveBeenCalledWith(null);
    });
});
