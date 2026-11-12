import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DataRepairDialog } from './DataRepairDialog';
import type { DataIssuesReport } from '../../../shared/dataRepair';

const mockToast = jest.fn();
const mockAlert = jest.fn();
jest.mock('../feedback', () => ({
    feedback: {
        toast: (...args: any[]) => mockToast(...args),
        alert: (...args: any[]) => mockAlert(...args),
        confirm: jest.fn(),
        notice: jest.fn(),
    },
}));

// The restore flow is a connected subtree; its own job (pick a board, then a
// list, then call moveCardToBoard per card) is not what this file pins down.
jest.mock('../Kanban/RestoreCardsDialog', () => ({
    RestoreCardsDialog: ({ open, cardIds }: any) =>
        open ? <div data-testid="restore-dialog">{cardIds.join(',')}</div> : null,
}));

const report: DataIssuesReport = {
    detachedCards: [
        { _id: 'c1', title: '调研', spentHours: 1.5, sessionCount: 2, listTitle: '待办' },
    ],
    orphanCards: [{ _id: 'c2', title: '旧草稿', spentHours: 0, sessionCount: 0 }],
    lists: [{ _id: 'l1', title: '待办' }],
    moves: { total: 3, cardCount: 1 },
    dangling: [
        { kind: 'listCards', ownerId: 'l2', ownerTitle: '进行中', count: 1 },
        { kind: 'cardSessions', ownerId: 'c1', ownerTitle: '调研', count: 1 },
    ],
};

const repairData = jest.fn();
const applyRepair = jest.fn();
const onRescan = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
    mockToast.mockClear();
    mockAlert.mockClear();
    repairData.mockReset();
    applyRepair.mockClear();
    onRescan.mockClear();
    onClose.mockClear();
    repairData.mockResolvedValue({
        removedCards: ['c1'],
        removedLists: ['l1'],
        updatedCards: {},
        updatedLists: {},
        updatedBoards: {},
        removedMoves: 3,
        repairedRefs: 2,
    });
    (window as any).api = { repairData };
});

const renderDialog = (value: DataIssuesReport = report) =>
    render(
        <DataRepairDialog
            open
            report={value}
            onClose={onClose}
            onRescan={onRescan}
            applyRepair={applyRepair}
        />
    );

const applyButton = () => screen.getByRole('button', { name: /Apply to selected/ });

describe('DataRepairDialog', () => {
    it('starts with the old-deletion residue checked and accident cards unchecked', () => {
        renderDialog();

        // Cards from a dead list, the list itself, moves and both dangling kinds
        // are selected; the card no list names is left alone.
        expect(screen.getByText('5 selected')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Restore selected (1)' })).toBeTruthy();
    });

    it('sends only the checked rows and applies the result', async () => {
        renderDialog();

        await act(async () => {
            fireEvent.click(applyButton());
        });

        expect(repairData).toHaveBeenCalledWith({
            cardIds: ['c1'],
            listIds: ['l1'],
            removeOrphanMoves: true,
            listCardRefIds: ['l2'],
            boardListRefIds: [],
            cardSessionRefIds: ['c1'],
        });
        expect(applyRepair).toHaveBeenCalledWith(expect.objectContaining({ removedCards: ['c1'] }));
        expect(onRescan).toHaveBeenCalledTimes(1);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
    });

    it('restores a single card from its row without deleting anything', () => {
        renderDialog();

        // The first row's button is the detached card's; the orphan card's is
        // the second one.
        const restoreButtons = screen.getAllByRole('button', { name: 'Restore' });
        fireEvent.click(restoreButtons[0]);

        expect(screen.getByTestId('restore-dialog').textContent).toBe('c1');
    });

    it('disables applying when nothing is selected', () => {
        renderDialog();

        // Clear every group whose select-all is on (the orphan group starts
        // unchecked, so its box is skipped).
        for (const box of screen.getAllByRole('checkbox', { name: 'Select all' })) {
            if ((box as HTMLInputElement).checked) {
                fireEvent.click(box);
            }
        }

        expect(screen.getByText('0 selected')).toBeTruthy();
        expect((applyButton() as HTMLButtonElement).disabled).toBe(true);
    });

    it('says what the dangling repair does and does not delete', () => {
        renderDialog();

        expect(screen.getByText(/Repairing removes only the references/i)).toBeTruthy();
        expect(screen.getByText(/List "进行中" references 1 missing card/i)).toBeTruthy();
    });

    it('keeps an unchecked row unchecked across a rescan', () => {
        const { rerender } = renderDialog();

        fireEvent.click(screen.getByRole('checkbox', { name: '调研' }));
        expect(screen.getByText('4 selected')).toBeTruthy();

        // The list and both dangling rows are gone; the card is still there and
        // must stay unchecked -- re-applying the defaults would silently mark
        // it for deletion again.
        const next: DataIssuesReport = {
            ...report,
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [],
        };
        rerender(
            <DataRepairDialog
                open
                report={next}
                onClose={onClose}
                onRescan={onRescan}
                applyRepair={applyRepair}
            />
        );

        const cardBox = screen.getByRole('checkbox', { name: '调研' }) as HTMLInputElement;
        expect(cardBox.checked).toBe(false);
        expect(screen.getByText('0 selected')).toBeTruthy();
    });

    it('shows the empty state when the rescan finds nothing', () => {
        renderDialog({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [],
        });

        expect(screen.getByText('Nothing to fix')).toBeTruthy();
    });
});
