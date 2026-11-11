import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UnassignedPanel } from './UnassignedPanel';
import { feedback } from '../../feedback';

jest.mock('../../feedback', () => ({
    ...jest.requireActual('../../feedback'),
    feedback: { confirm: jest.fn(), toast: jest.fn(), alert: jest.fn() },
}));

// The real picker is a connected dialog; the panel's own logic (selection,
// pending picks, submission) is what this file pins down.
jest.mock('../CardPicker', () => ({
    CardPicker: ({ open, onPick }: any) =>
        open ? (
            <button data-testid="pick-c1" onClick={() => onPick('c1')}>
                pick
            </button>
        ) : null,
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

const summary = (id: string, hour: number, appCount: number) => ({
    _id: id,
    startTime: new Date(2026, 10, 11, hour, 0).getTime(),
    spentTimeInHour: 0.5,
    appCount,
});

const onSaved = jest.fn();
const applyEdits = jest.fn();
const applySessionEdits = jest.fn();

const renderPanel = (rows = [summary('s1', 9, 3), summary('s2', 10, 1)], total = 2) =>
    render(
        <UnassignedPanel
            boardId="b1"
            boardName="Project A"
            open
            onClose={jest.fn()}
            rows={rows}
            total={total}
            onSaved={onSaved}
            applyEdits={applyEdits}
            cards={cards}
        />
    );

/** Runs the confirm dialog's OK action, so the transaction actually fires. */
const acceptConfirm = async () => {
    const options = (feedback.confirm as jest.Mock).mock.calls[0][0];
    await act(async () => {
        await options.onOk();
    });
};

describe('UnassignedPanel', () => {
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

    it('lists the unassigned sessions with their time and app count', () => {
        const view = renderPanel();

        expect(view.getByTestId('unassigned-meta-s1').textContent).toBe('0.50h · 3 apps');
        expect(view.getByTestId('unassigned-meta-s2').textContent).toBe('0.50h · 1 app');
    });

    it('assigns the selected sessions to one card on save', async () => {
        const view = renderPanel();

        fireEvent.click(view.getAllByRole('checkbox')[0]);
        fireEvent.click(view.getByRole('button', { name: 'Assign to a card' }));
        fireEvent.click(view.getByTestId('pick-c1'));

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', cardId: 'c1' }]);
        expect(applyEdits).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'success',
            content: 'Sessions assigned',
        });
    });

    it('lets a single row be assigned without selecting it', async () => {
        const view = renderPanel();

        fireEvent.click(view.getByTestId('unassigned-card-s1'));
        fireEvent.click(view.getByTestId('pick-c1'));

        expect(view.getByText('Card One')).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: 'Save' }));
        await acceptConfirm();

        expect(applySessionEdits).toHaveBeenCalledWith([{ _id: 's1', cardId: 'c1' }]);
    });

    it('does nothing when no card has been picked', () => {
        const view = renderPanel();

        fireEvent.click(view.getByRole('button', { name: 'Save' }));

        expect(feedback.toast).toHaveBeenCalledWith({
            kind: 'info',
            content: 'Pick a card for at least one session',
        });
        expect(applySessionEdits).not.toHaveBeenCalled();
    });

    it('shows the empty state when nothing is unassigned', () => {
        const view = renderPanel([], 0);

        expect(view.getByText('Nothing is waiting for a card')).toBeTruthy();
    });
});
