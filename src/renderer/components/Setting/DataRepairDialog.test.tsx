import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DataRepairDialog } from './DataRepairDialog';
import type { DataIssuesReport } from '../../../shared/dataRepair';

const mockToast = jest.fn();
const mockAlert = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../feedback', () => ({
    feedback: {
        toast: (...args: any[]) => mockToast(...args),
        alert: (...args: any[]) => mockAlert(...args),
        confirm: (...args: any[]) => mockConfirm(...args),
        notice: jest.fn(),
    },
}));

// The restore flow is a connected subtree; its own job (pick a board, then a
// list, then call moveCardToBoard per card) is not what this file pins down.
jest.mock('../Kanban/RestoreCardsDialog', () => ({
    RestoreCardsDialog: ({ open, cardIds }: any) =>
        open ? <div>{`restoring=${cardIds.join(',')}`}</div> : null,
}));

const report: DataIssuesReport = {
    detachedCards: [
        { _id: 'c1', title: '调研', spentHours: 1.5, sessionCount: 2, listTitle: '待办' },
    ],
    orphanCards: [{ _id: 'c2', title: '旧草稿', spentHours: 0, sessionCount: 0 }],
    lists: [{ _id: 'l1', title: '待办' }],
    moves: { total: 3, cardCount: 1 },
    dangling: [
        {
            kind: 'listCards',
            ownerId: 'l2',
            ownerTitle: '进行中',
            count: 1,
            ids: [{ id: 'goneCard', times: 1 }],
        },
        {
            kind: 'cardSessions',
            ownerId: 'c1',
            ownerTitle: '调研',
            count: 1,
            ids: [{ id: 'goneSession', times: 1 }],
        },
    ],
};

const repairData = jest.fn();
const applyRepair = jest.fn();
const onRescan = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
    mockToast.mockClear();
    mockAlert.mockClear();
    mockConfirm.mockClear();
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

/** Runs the confirmation dialog's OK action, so the transaction actually fires. */
const acceptConfirm = async () => {
    await act(async () => {
        await mockConfirm.mock.calls[0][0].onOk();
    });
};

/** Renders the confirmation body as text. */
const confirmText = () => {
    const content = mockConfirm.mock.calls[0][0].content;
    const { container, unmount } = render(<>{content}</>);
    const text = container.textContent ?? '';
    unmount();
    return text;
};

describe('DataRepairDialog', () => {
    it('starts with the old-deletion residue checked and accident cards unchecked', () => {
        renderDialog();

        // Cards from a dead list, the list itself, moves and both dangling kinds
        // are selected; the card no list names is left alone.
        expect(screen.getByText('5 selected')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Restore selected (1)' })).toBeTruthy();
    });

    it('shows the counts before touching anything', async () => {
        renderDialog();

        fireEvent.click(applyButton());

        // Nothing has been written yet.
        expect(repairData).not.toHaveBeenCalled();
        expect(applyRepair).not.toHaveBeenCalled();

        const text = confirmText();
        expect(text).toContain('1 card');
        expect(text).toContain('1 list');
        expect(text).toContain('3 move records');
        expect(text).toContain('2 references');
        expect(text).toContain('Deleting cannot be undone');
    });

    it('sends the whole selection once confirmed', async () => {
        renderDialog();

        fireEvent.click(applyButton());
        await acceptConfirm();

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

    it('confirms even when the selection only repairs references', () => {
        renderDialog({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [
                {
                    kind: 'listCards',
                    ownerId: 'l2',
                    ownerTitle: '进行中',
                    count: 1,
                    ids: [{ id: 'goneCard', times: 1 }],
                },
            ],
        });

        fireEvent.click(applyButton());

        expect(mockConfirm).toHaveBeenCalledTimes(1);
        expect(repairData).not.toHaveBeenCalled();
        expect(confirmText()).toContain('1 reference');
    });

    it('lists the dead ids under a row and folds them after five', () => {
        renderDialog({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [
                {
                    kind: 'cardSessions',
                    ownerId: 'c1',
                    ownerTitle: '调研',
                    count: 7,
                    ids: Array.from({ length: 7 }, (_, index) => ({
                        id: `dead-${index}`,
                        times: 1,
                    })),
                },
            ],
        });

        // The owner id is the only stable handle: the title can be edited.
        expect(screen.getByText('c1')).toBeTruthy();
        expect(screen.getByText('dead-0')).toBeTruthy();
        expect(screen.getByText('dead-4')).toBeTruthy();
        expect(screen.queryByText('dead-5')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Show more/ }));

        expect(screen.getByText('dead-6')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
    });

    it('notes how often a repeated id is named', () => {
        renderDialog({
            detachedCards: [],
            orphanCards: [],
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [
                {
                    kind: 'cardSessions',
                    ownerId: 'c1',
                    ownerTitle: '调研',
                    count: 3,
                    ids: [{ id: 'goneSession', times: 3 }],
                },
            ],
        });

        expect(screen.getByText('goneSession ×3')).toBeTruthy();
    });

    it('restores a single card from its row without deleting anything', () => {
        renderDialog();

        // The first row's button is the detached card's; the orphan card's is
        // the second one.
        const restoreButtons = screen.getAllByRole('button', { name: 'Restore' });
        fireEvent.click(restoreButtons[0]);

        expect(screen.getByText('restoring=c1')).toBeTruthy();
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

    it('folds a long group and expands it on demand', () => {
        const orphans = Array.from({ length: 60 }, (_, index) => ({
            _id: `c${index}`,
            title: `card-${index}`,
            spentHours: 0,
            sessionCount: 0,
        }));
        renderDialog({
            detachedCards: [],
            orphanCards: orphans,
            lists: [],
            moves: { total: 0, cardCount: 0 },
            dangling: [],
        });

        const cardBoxes = () => screen.getAllByRole('checkbox', { name: /^card-/ });
        const shown = cardBoxes().length;
        // Folded, not lost: the group is shorter than the data until expanded.
        expect(shown).toBeGreaterThan(0);
        expect(shown).toBeLessThan(orphans.length);

        fireEvent.click(
            screen.getByRole('button', {
                name: new RegExp(`Show all \\(${orphans.length - shown} more\\)`),
            })
        );
        expect(cardBoxes()).toHaveLength(orphans.length);
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
