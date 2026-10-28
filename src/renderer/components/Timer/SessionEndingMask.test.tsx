import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { TimerMask } from './SessionEndingMask';
import { DAY_THEME_ID } from '../../theme/tokens';

jest.mock('./action', () => ({
    actions: { setBoardId: jest.fn() },
    LONG_BREAK_INTERVAL: 4,
}));

jest.mock('./PomodoroNumView', () => ({
    PomodoroNumView: () => <div data-testid="pomodoro-num-view" />,
}));

const boards = {
    b1: { _id: 'b1', name: 'Project One' },
    b2: { _id: 'b2', name: 'Project Two' },
};

const state = {
    timer: {
        isFocusing: true,
        iBreak: 0,
        boardId: 'b1',
        compact: false,
        themeId: DAY_THEME_ID,
    },
    kanban: { boards },
};

const renderMask = (
    props: Partial<React.ComponentProps<typeof TimerMask>> = {},
    timer: Partial<typeof state.timer> = {}
) => {
    const store = createStore((value: any) => value, {
        ...state,
        timer: { ...state.timer, ...timer },
    });
    return render(
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
};

describe('TimerMask', () => {
    afterEach(cleanup);

    it('shows the selected project and starts the next focus session', () => {
        const onStart = jest.fn();
        const view = renderMask({ onStart });

        expect(view.getByText('Project One')).toBeTruthy();
        expect(view.getByText('Session Finished')).toBeTruthy();
        expect(view.getByTestId('pomodoro-num-view')).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: /Start Short Break/ }));

        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('falls back to the predicted project while no board is selected', () => {
        const view = renderMask({ stagedProjectId: 'b2' }, { boardId: undefined });

        expect(view.getByText('Project Two')).toBeTruthy();
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
