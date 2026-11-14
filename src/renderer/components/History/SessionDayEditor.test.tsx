import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { SessionDayEditor } from './SessionDayEditor';
import { feedback } from '../feedback';
import { cardReducer } from '../Kanban/Card/action';
import type { PomodoroRecord } from '../../monitor/type';

jest.mock('../feedback', () => ({
    ...jest.requireActual('../feedback'),
    feedback: { confirm: jest.fn(), toast: jest.fn(), alert: jest.fn() },
}));

// The dot is an SVG whose <title> repeats the row's time, which makes text
// queries ambiguous; the editor only has to hand it the full record.
jest.mock('../Timer/PomodoroNumView', () => ({
    PomodoroNumView: ({ pomodoros, chooseRecord }: any) => (
        <button onClick={() => chooseRecord(pomodoros[0])}>Sankey {pomodoros[0]._id}</button>
    ),
}));

const board = (id: string, name: string, lists: string[]) => ({
    _id: id,
    name,
    description: '',
    lists,
    focusedList: lists[0],
    doneList: lists[0],
    relatedSessions: [],
    spentHours: 0,
});

const card = (id: string, title: string, sessionIds: string[]) => ({
    _id: id,
    title,
    content: '',
    sessionIds,
    spentTimeInHour: { estimated: 0, actual: 0 },
});

const state = {
    kanban: {
        boards: {
            b1: board('b1', 'Project A', ['l1']),
            b2: board('b2', 'Project B', ['l2']),
        },
        lists: {
            l1: { _id: 'l1', title: 'Todo', cards: ['c1', 'c2'] },
            l2: { _id: 'l2', title: 'Doing', cards: ['c3'] },
        },
        cards: {
            c1: card('c1', 'Card One', ['s1']),
            c2: card('c2', 'Card Two', []),
            c3: card('c3', 'Card Three', []),
        },
    },
};

const record = (
    id: string,
    hour: number,
    boardId?: string,
    spentTimeInHour = 0.5
): PomodoroRecord => ({
    _id: id,
    startTime: new Date(2026, 10, 11, hour, 0).getTime(),
    spentTimeInHour,
    switchTimes: 0,
    apps: {},
    boardId,
});

const renderEditor = (records: PomodoroRecord[]) => {
    // The real card reducer: saving has to land in the store, not just in the
    // database, or the next open still shows the old ownership.
    const store = createStore(
        (value: any, action: any) => ({
            ...value,
            // The overlay is app-level: the editor's output is the action that
            // picks a record for it.
            chosenRecord:
                action.type === '[Timer]SET_CHOSEN_RECORD'
                    ? action.payload.record
                    : value.chosenRecord,
            kanban: {
                ...value.kanban,
                cards: cardReducer(value.kanban.cards, action),
            },
        }),
        state
    );
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const view = render(
        <Provider store={store}>
            <SessionDayEditor open records={records} onClose={onClose} onSaved={onSaved} />
        </Provider>
    );
    return { ...view, store, onSaved, onClose };
};

/** Runs the confirm dialog's OK action, so the transaction actually fires. */
const acceptConfirm = async () => {
    const options = (feedback.confirm as jest.Mock).mock.calls[0][0];
    await act(async () => {
        await options.onOk();
    });
};

describe('SessionDayEditor', () => {
    const applySessionEdits = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        applySessionEdits.mockResolvedValue({
            deleted: [],
            sessions: [],
            updatedCards: {},
            updatedBoards: {},
        });
        (window as any).api = { ...(window as any).api, applySessionEdits };
    });

    afterEach(cleanup);

    it('lists the day with project and card names', () => {
        const view = renderEditor([record('s1', 9, 'b1'), record('s2', 10, 'b1')]);

        expect(view.getByText('09:00')).toBeTruthy();
        expect(view.getByText('10:00')).toBeTruthy();
        expect(view.getByRole('button', { name: 'Card One' })).toBeTruthy();
        // Both records belong to the same project, so both rows name it.
        expect(view.getAllByRole('button', { name: 'Project A' })).toHaveLength(2);
        expect(view.getByRole('button', { name: 'No card' })).toBeTruthy();
    });

    it('opens the Sankey overlay with the full record behind a row', () => {
        const records = [record('s1', 9, 'b1')];
        const view = renderEditor(records);

        fireEvent.click(view.getByRole('button', { name: 'Sankey s1' }));

        expect(view.store.getState().chosenRecord).toBe(records[0]);
    });

    it('saves a card change alone', async () => {
        const view = renderEditor([record('s1', 9, 'b1'), record('s2', 10, 'b1')]);

        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.click(view.getByText('Card Two'));

        expect(view.getByRole('button', { name: 'Card Two' })).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', cardId: 'c2' }]);
        expect(view.onSaved).toHaveBeenCalledTimes(1);
        expect(view.onClose).toHaveBeenCalledTimes(1);
    });

    it('marks a record for deletion and sends it as a delete edit', async () => {
        const view = renderEditor([record('s1', 9, 'b1'), record('s2', 10, 'b1')]);

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        expect(view.getByRole('button', { name: 'Undo' })).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', delete: true }]);
    });

    it('clears the card when a record moves to another project', async () => {
        const view = renderEditor([record('s1', 9, 'b1')]);

        fireEvent.click(view.getByRole('button', { name: 'Project A' }));
        fireEvent.click(view.getByText('Project B'));

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([
            { _id: 's1', boardId: 'b2', cardId: null },
        ]);
    });

    it('filters to the records without a card', () => {
        const view = renderEditor([record('s1', 9, 'b1'), record('s2', 10, 'b1')]);

        fireEvent.click(view.getByRole('radio', { name: 'No card' }));

        expect(view.queryByText('09:00')).toBeNull();
        expect(view.getByText('10:00')).toBeTruthy();
    });

    it('applies a project to every selected record at once', async () => {
        const view = renderEditor([record('s1', 9, 'b1'), record('s2', 10, 'b1')]);

        fireEvent.click(view.getByRole('button', { name: 'Select all' }));
        fireEvent.click(view.getByRole('button', { name: 'Set project' }));
        fireEvent.click(view.getByText('Project B'));

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([
            { _id: 's1', boardId: 'b2', cardId: null },
            { _id: 's2', boardId: 'b2' },
        ]);
    });

    it('asks before discarding unsaved edits', () => {
        const view = renderEditor([record('s1', 9, 'b1')]);

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

        expect(view.onClose).not.toHaveBeenCalled();
        expect(feedback.confirm).toHaveBeenCalledTimes(1);
    });

    // Regression: saving wrote the database only; the card column kept showing
    // the old owner until the app was restarted.
    it('writes the transaction result back into the store', async () => {
        applySessionEdits.mockResolvedValueOnce({
            deleted: [],
            sessions: [{ _id: 's1', boardId: 'b1' }],
            updatedCards: {
                c1: card('c1', 'Card One', []),
                c2: card('c2', 'Card Two', ['s1']),
            },
            updatedBoards: {},
        });

        const view = renderEditor([record('s1', 9, 'b1')]);
        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.click(view.getByText('Card Two'));
        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        const cards = view.store.getState().kanban.cards;
        expect(cards.c1.sessionIds).toStrictEqual([]);
        expect(cards.c2.sessionIds).toStrictEqual(['s1']);
    });

    it('reports a failed transaction and keeps the editor open', async () => {
        applySessionEdits.mockRejectedValueOnce(new Error('boom'));

        const view = renderEditor([record('s1', 9, 'b1')]);
        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(feedback.alert).toHaveBeenCalledTimes(1);
        expect(view.onClose).not.toHaveBeenCalled();
    });
});
