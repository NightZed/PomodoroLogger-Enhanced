import * as React from 'react';
import { connect } from 'react-redux';
import { ProjectPicker } from './ProjectPicker';
import { ListPicker } from './ListPicker';
import { moveCardToBoard } from './cardMove';
import { feedback } from '../feedback';
import { useI18n } from '../../i18n';
import { genMapDispatchToProp } from '../../utils';

export interface CardMoveDialogProps {
    open: boolean;
    /** The card being moved; without one there is nothing to move. */
    cardId?: string;
    /** The list the card is in now, so it cannot be picked as destination. */
    sourceListId?: string;
    onClose: () => void;
    /** Called after a successful move, e.g. so the card editor can close. */
    onMoved?: () => void;
}

interface Props extends CardMoveDialogProps {
    move: (cardId: string, targetListId: string) => Promise<unknown>;
}

const CardMoveDialogInner = (props: Props) => {
    const { t } = useI18n();
    const [step, setStep] = React.useState<'project' | 'list'>('project');
    const [targetBoardId, setTargetBoardId] = React.useState<string | undefined>();
    const [busy, setBusy] = React.useState(false);

    // Every open starts at the project step: the previous destination is not a
    // sensible default for a card that may already be somewhere else.
    React.useEffect(() => {
        if (props.open) {
            setStep('project');
            setTargetBoardId(undefined);
            setBusy(false);
        }
    }, [props.open]);

    const move = async (listId: string): Promise<void> => {
        if (props.cardId === undefined) {
            return;
        }
        setBusy(true);
        try {
            await props.move(props.cardId, listId);
            feedback.toast({ kind: 'success', content: t('kanban.cardMove.moved') });
            props.onClose();
            // The card now lives in another list, so the editor's own `listId`
            // (and its done-list label) is stale; let the caller close it.
            props.onMoved?.();
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            feedback.alert({ kind: 'error', title: t('kanban.cardMove.failed', detail) });
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <ProjectPicker
                open={props.open && step === 'project'}
                value={targetBoardId}
                allowNone={false}
                onPick={(boardId) => {
                    if (boardId === undefined) {
                        return;
                    }
                    setTargetBoardId(boardId);
                    setStep('list');
                }}
                onClose={props.onClose}
            />
            <ListPicker
                open={props.open && step === 'list'}
                boardId={targetBoardId}
                cardId={props.cardId}
                sourceListId={props.sourceListId}
                busy={busy}
                onMove={move}
                // Back to the project step rather than closing: the wrong board
                // is the likeliest reason to be here at all.
                onCancel={() => setStep('project')}
            />
        </>
    );
};

/**
 * "Move card to…" as a two-step flow: choose the board, then the list inside
 * it. The split is not cosmetic -- the destination list cannot be offered
 * until the board is known -- and the main process owns the actual move.
 */
export const CardMoveDialog = connect(
    null,
    genMapDispatchToProp<Pick<Props, 'move'>>({ move: moveCardToBoard })
)(CardMoveDialogInner);
