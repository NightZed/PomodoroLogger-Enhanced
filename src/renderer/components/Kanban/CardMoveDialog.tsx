import * as React from 'react';
import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import { BoardListPicker } from './BoardListPicker';
import { moveCardToBoardAndRefresh } from '../../dataReload';
import { feedback } from '../feedback';
import { useI18n } from '../../i18n';
import type { RootState } from '../../reducers';

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
    lists: RootState['kanban']['lists'];
    boards: RootState['kanban']['boards'];
    move: (cardId: string, targetListId: string) => Promise<unknown>;
}

/** The destination label of the "moved" toast: qualified with the board name when it crosses boards. */
const destinationLabel = (
    boards: Props['boards'],
    lists: Props['lists'],
    sourceListId: string | undefined,
    targetBoardId: string,
    targetListId: string
): string => {
    const listTitle = lists[targetListId]?.title;
    if (listTitle === undefined) {
        return '';
    }
    const targetBoard = boards[targetBoardId];
    const sourceBoard =
        sourceListId === undefined
            ? undefined
            : Object.values(boards).find((board) => board.lists.includes(sourceListId));
    return targetBoard === undefined || targetBoard === sourceBoard
        ? listTitle
        : `${targetBoard.name} › ${listTitle}`;
};

const CardMoveDialogInner = (props: Props) => {
    const { t } = useI18n();
    const [busy, setBusy] = React.useState(false);

    const move = async (boardId: string, listId: string): Promise<void> => {
        if (props.cardId === undefined) {
            return;
        }
        // Resolve the names before the move: a move changes card membership,
        // not list or board titles, so the click-time snapshot is what the
        // toast shows.
        const fromTitle =
            props.sourceListId === undefined ? undefined : props.lists[props.sourceListId]?.title;
        const toLabel = destinationLabel(
            props.boards,
            props.lists,
            props.sourceListId,
            boardId,
            listId
        );
        setBusy(true);
        try {
            await props.move(props.cardId, listId);
            feedback.toast({
                kind: 'success',
                content: t('kanban.cardMove.moved', fromTitle ?? '', toLabel),
            });
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
        <BoardListPicker
            open={props.open}
            cardId={props.cardId}
            sourceListId={props.sourceListId}
            busy={busy}
            onConfirm={(boardId, listId) => {
                void move(boardId, listId);
            }}
            onClose={props.onClose}
        />
    );
};

/**
 * "Move card to…" as a two-step flow in a single dialog: choose the board,
 * then the list inside it. The split is not cosmetic -- the destination list
 * cannot be offered until the board is known -- and the main process owns the
 * actual move.
 */
export const CardMoveDialog = connect(
    (state: RootState) => ({
        lists: state.kanban.lists,
        boards: state.kanban.boards,
    }),
    (dispatch: Dispatch) => ({
        move: (cardId: string, targetListId: string) =>
            dispatch(moveCardToBoardAndRefresh(cardId, targetListId) as any),
    })
)(CardMoveDialogInner);
