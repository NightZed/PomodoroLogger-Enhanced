import * as React from 'react';
import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import { BoardListPicker } from './BoardListPicker';
import { moveCardToBoardAndRefresh } from '../../dataReload';
import { feedback } from '../feedback';
import { useI18n } from '../../i18n';

export interface RestoreCardsDialogProps {
    open: boolean;
    /** Cards to put back into one list. */
    cardIds: string[];
    onClose: () => void;
    /**
     * Cards that were actually restored. Called on partial failure too, so the
     * caller can drop the rows that no longer need attention.
     */
    onRestored: (cardIds: string[]) => void;
}

interface Props extends RestoreCardsDialogProps {
    move: (cardId: string, targetListId: string) => Promise<unknown>;
}

/**
 * Puts orphaned cards back into the list the user picks.
 *
 * Restoring goes through `moveCardToBoard` rather than pushing ids into
 * `list.cards`: the card's sessions carry their own `boardId`, and a card that
 * lands in a board while its focus time stays on the old (or a deleted) project
 * is exactly the split the card move was written to prevent. That also means a
 * restored card's sessions stop showing as `Unknown` in History.
 */
const RestoreCardsDialogInner = (props: Props) => {
    const { t } = useI18n();
    const [busy, setBusy] = React.useState(false);

    const restore = async (listId: string): Promise<void> => {
        if (props.cardIds.length === 0) {
            return;
        }
        setBusy(true);
        const restored: string[] = [];
        try {
            for (const cardId of props.cardIds) {
                await props.move(cardId, listId);
                restored.push(cardId);
            }
            feedback.toast({
                kind: 'success',
                content: t('dataRepair.restored', restored.length),
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            // A partial batch still moved some cards; report both halves so the
            // caller can drop the ones that are no longer orphaned.
            feedback.alert({
                kind: 'error',
                title: t('dataRepair.restoreFailed'),
                content: t('dataRepair.restoreFailedDetail', restored.length, detail),
            });
        } finally {
            setBusy(false);
            if (restored.length > 0) {
                props.onRestored(restored);
            }
            props.onClose();
        }
    };

    return (
        <BoardListPicker
            open={props.open}
            busy={busy}
            actionLabel={t('dataRepair.restore')}
            onConfirm={(_boardId, listId) => {
                void restore(listId);
            }}
            onClose={props.onClose}
        />
    );
};

export const RestoreCardsDialog = connect(null, (dispatch: Dispatch) => ({
    move: (cardId: string, targetListId: string) =>
        dispatch(moveCardToBoardAndRefresh(cardId, targetListId) as any),
}))(RestoreCardsDialogInner);
