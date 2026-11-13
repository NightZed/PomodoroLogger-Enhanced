import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImportReportDialog } from './ImportReportDialog';
import type { ImportSummary } from '../../../shared/dataTransfer/importSummary';

const summary = (over: Partial<ImportSummary['counts']> = {}): ImportSummary => ({
    counts: {
        cardsOutsideLists: 0,
        deadMoves: 0,
        danglingSessions: 0,
        unknownBoard: 0,
        noBoard: 0,
        rehomed: 0,
        ...over,
    },
});

const renderDialog = (value: ImportSummary) => {
    const onClose = jest.fn();
    const onOpenLogDir = jest.fn();
    const onCheckData = jest.fn();
    render(
        <ImportReportDialog
            open
            summary={value}
            onClose={onClose}
            onOpenLogDir={onOpenLogDir}
            onCheckData={onCheckData}
        />
    );
    return { onClose, onOpenLogDir, onCheckData };
};

describe('ImportReportDialog', () => {
    it('groups the counts by what the user can do', () => {
        renderDialog(
            summary({
                cardsOutsideLists: 12,
                deadMoves: 4,
                danglingSessions: 2,
                unknownBoard: 5,
                noBoard: 32,
                rehomed: 6,
            })
        );

        expect(screen.getByText(/12 cards not in any list/)).toBeTruthy();
        expect(screen.getByText(/4 move records pointing at missing cards/)).toBeTruthy();
        expect(screen.getByText(/2 cards referencing missing focus sessions/)).toBeTruthy();
        expect(screen.getByText(/5 sessions whose project was deleted/)).toBeTruthy();
        expect(screen.getByText(/32 sessions without a project/)).toBeTruthy();
        expect(screen.getByText(/6 cards put back into a list/)).toBeTruthy();
    });

    it('hides empty groups', () => {
        renderDialog(summary({ deadMoves: 1 }));

        expect(screen.getByText(/1 move record pointing/)).toBeTruthy();
        expect(screen.queryByText(/not in any list/)).toBeNull();
        expect(screen.queryByText(/without a project/)).toBeNull();
        expect(screen.queryByText(/put back into a list/)).toBeNull();
    });

    it('offers the log folder, the data check and done', () => {
        const { onClose, onOpenLogDir, onCheckData } = renderDialog(
            summary({ cardsOutsideLists: 1 })
        );

        fireEvent.click(screen.getByRole('button', { name: /Open Log Folder/ }));
        expect(onOpenLogDir).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /Check & Repair Data/ }));
        expect(onCheckData).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /Done/ }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
