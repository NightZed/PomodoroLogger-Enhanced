import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UnassignedPanel } from './UnassignedPanel';
import { feedback } from '../../feedback';

jest.mock('../../feedback', () => ({
    ...jest.requireActual('../../feedback'),
    feedback: { confirm: jest.fn(), toast: jest.fn(), alert: jest.fn() },
}));

// The real picker is a connected dialog; the panel's own logic (selection,
// draft picks, deletion marks, submission) is what this file pins down.
jest.mock('../CardPicker', () => ({
    CardPicker: ({ open, onPick }: any) =>
        open ? (
            <>
                <button onClick={() => onPick('c1')}>Pick Card One</button>
                <button onClick={() => onPick(undefined)}>Pick no card</button>
            </>
        ) : null,
}));

// The dot is an SVG whose click target carries no accessible name; replacing
// it keeps the test on the panel's wiring (load the row, hand it to the
// overlay) instead of reaching for a circle element.
jest.mock('../../Timer/PomodoroNumView', () => ({
    PomodoroNumView: ({ pomodoros, chooseRecord }: any) => (
        <button onClick={() => chooseRecord(pomodoros[0])}>Sankey {pomodoros[0]._id}</button>
    ),
}));

const cards = {
    c1: {
        _id: 'c1',
        title: 'Card One',
        content: '',
        sessionIds: [],
        spentTimeInHour: { estimated: 0, actual: 0 },
    },
};

const summary = (id: string, hour: number) => ({
    _id: id,
    startTime: new Date(2026, 10, 11, hour, 0).getTime(),
    spentTimeInHour: 0.5,
    appCount: 3,
});

const onSaved = jest.fn();
const applyEdits = jest.fn();
const applySessionEdits = jest.fn();
const chooseRecord = jest.fn();

const renderPanel = (
    rows = [summary('s1', 9), summary('s2', 10)],
    total = rows.length,
    over: { onClose?: () => void; loadRecord?: jest.Mock } = {}
) => {
    const loadRecord =
        over.loadRecord ??
        jest.fn().mockResolvedValue({ _id: 's1', startTime: Date.now(), apps: {} });
    const view = render(
        <UnassignedPanel
            boardId="b1"
            boardName="Project A"
            open
            onClose={over.onClose ?? jest.fn()}
            rows={rows}
            total={total}
            onSaved={onSaved}
            applyEdits={applyEdits}
            cards={cards}
            loadRecord={loadRecord}
            chooseRecord={chooseRecord}
        />
    );
    return { ...view, loadRecord };
};

/** Runs the last confirm dialog's OK action, so the transaction fires. */
const acceptConfirm = async () => {
    const options = (feedback.confirm as jest.Mock).mock.calls[0][0];
    await act(async () => {
        await options.onOk();
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    applySessionEdits.mockResolvedValue({
        deleted: [],
        sessions: [{ _id: 's1', boardId: 'b1' }],
        updatedCards: { c1: { ...cards.c1, sessionIds: ['s1'] } },
        updatedBoards: {},
    });
    (window as any).api = { ...(window as any).api, applySessionEdits };
});

afterEach(cleanup);

describe('UnassignedPanel', () => {
    it('lists each session with its day, time and length', () => {
        const view = renderPanel();

        expect(view.getByText('11-11 09:00')).toBeTruthy();
        expect(view.getByText('11-11 10:00')).toBeTruthy();
        expect(view.getAllByText('0.50h')).toHaveLength(2);
        expect(view.getAllByRole('button', { name: 'No card' })).toHaveLength(2);
    });

    it('assigns the selected sessions to one card on save', async () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('checkbox')[0]);
        fireEvent.click(view.getByRole('button', { name: 'Set card' }));
        fireEvent.click(view.getByRole('button', { name: 'Pick Card One' }));

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', cardId: 'c1' }]);
        expect(applyEdits).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'success',
            content: 'Sessions updated',
        });
    });

    it('lets a single row be assigned without selecting it', async () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('button', { name: 'No card' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Pick Card One' }));

        expect(view.getByText('Card One')).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', cardId: 'c1' }]);
    });

    it('drops a pick when the row is set back to "no card"', async () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('button', { name: 'No card' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Pick Card One' }));
        fireEvent.click(view.getByRole('button', { name: 'Card One' }));
        fireEvent.click(view.getByRole('button', { name: 'Pick no card' }));

        fireEvent.click(view.getByRole('button', { name: 'Save' }));

        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'info',
            content: 'Nothing has changed',
        });
        expect(applySessionEdits).not.toHaveBeenCalled();
    });

    it('submits a marked row as a deletion', async () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', delete: true }]);
    });

    it('does not submit a deletion that was undone', () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Undo' }));
        fireEvent.click(view.getByRole('button', { name: 'Save' }));

        expect(applySessionEdits).not.toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'info',
            content: 'Nothing has changed',
        });
    });

    it('selects only the rows that are not marked for deletion', () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Select all' }));

        expect(view.getByText('1 selected')).toBeTruthy();
    });

    it('asks before closing when changes are pending', () => {
        const onClose = jest.fn();
        const view = renderPanel(undefined, 2, { onClose });

        fireEvent.click(view.getAllByRole('button', { name: 'Delete' })[0]);
        fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

        expect(onClose).not.toHaveBeenCalled();
        expect(feedback.confirm).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Discard changes?' })
        );
    });

    it('closes straight away when nothing changed', () => {
        const onClose = jest.fn();
        const view = renderPanel(undefined, 2, { onClose });

        fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(feedback.confirm).not.toHaveBeenCalled();
    });

    it('opens the Sankey overlay with the full record of the clicked row', async () => {
        const record = {
            _id: 's1',
            startTime: new Date(2026, 10, 11, 9, 0).getTime(),
            apps: {},
            stayTimeInSecond: [],
            switchActivities: [],
        };
        const loadRecord = jest.fn().mockResolvedValue(record);
        const view = renderPanel(undefined, 2, { loadRecord });

        await act(async () => {
            fireEvent.click(view.getByRole('button', { name: 'Sankey s1' }));
        });

        // The list row is only a summary, so the record has to be read back.
        expect(loadRecord).toHaveBeenCalledWith('s1');
        expect(chooseRecord).toHaveBeenCalledWith(record);
    });

    // Regression: an id that no longer resolves used to leave the click with
    // no visible effect at all, which reads as "the dot is broken".
    it('reports a record that cannot be loaded', async () => {
        const loadRecord = jest.fn().mockResolvedValue(undefined);
        const view = renderPanel(undefined, 2, { loadRecord });

        await act(async () => {
            fireEvent.click(view.getByRole('button', { name: 'Sankey s1' }));
        });

        expect(chooseRecord).not.toHaveBeenCalled();
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'error',
            content: 'That session could not be loaded',
        });
    });

    it('shows the empty state when nothing is unassigned', () => {
        const view = renderPanel([], 0);

        expect(view.getByText('Nothing is waiting for a card')).toBeTruthy();
    });
});
