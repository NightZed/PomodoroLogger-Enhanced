import * as React from 'react';
import { connect } from 'react-redux';
import { AppModal } from '../AppModal';
import { useI18n } from '../../i18n';
import { DAY_EDITOR_WIDTH } from '../dialogLayout';
import { ProjectPickerBody } from './ProjectPicker';
import { ListPickerBody } from './ListPickerBody';
import type { RootState } from '../../reducers';

export interface BoardListPickerProps {
    open: boolean;
    /** The card being moved, for the session hints; omitted when restoring. */
    cardId?: string;
    /** The card's current list, which cannot be its destination. */
    sourceListId?: string;
    busy?: boolean;
    /** Confirm button text; the data check restores instead of moving. */
    actionLabel?: string;
    onConfirm: (boardId: string, listId: string) => void;
    onClose: () => void;
}

interface Props extends BoardListPickerProps {
    boards: RootState['kanban']['boards'];
}

/**
 * Move/restore a card in two steps: pick the board, then the list inside it.
 *
 * Both steps share ONE `AppModal` on purpose. Two dialogs swapping via
 * `open={step === ...}` close and open in the same commit, and rc-motion keeps
 * the closing mask mounted until its leave animation ends -- one or two frames
 * after the new mask is already fully opaque. The two 45%-black masks stack to
 * ~70%, so the background flashes darker on every step change (forward and
 * cancel alike). One dialog can only ever have one mask, and swapping its
 * content also keeps the panel from changing height between steps.
 */
const BoardListPickerInner = (props: Props) => {
    const { t } = useI18n();
    const [step, setStep] = React.useState<'project' | 'list'>('project');
    const [boardId, setBoardId] = React.useState<string | undefined>();

    // Reset during render rather than in an effect: effects run after the
    // first paint, so the frame that opens the dialog would still show the
    // step it was left on last time.
    const [wasOpen, setWasOpen] = React.useState(props.open);
    if (props.open !== wasOpen) {
        setWasOpen(props.open);
        if (props.open) {
            setStep('project');
            setBoardId(undefined);
        }
    }

    const onProjectStep = step === 'project';
    const board = boardId === undefined ? undefined : props.boards[boardId];

    return (
        <AppModal
            open={props.open}
            title={
                onProjectStep
                    ? t('kanban.projectPicker.title')
                    : t('kanban.cardMove.listTitle', board?.name ?? '')
            }
            onCancel={onProjectStep ? props.onClose : () => setStep('project')}
            zIndex={1100}
            width={DAY_EDITOR_WIDTH}
            footer={null}
            destroyOnHidden
        >
            {onProjectStep ? (
                <ProjectPickerBody
                    value={boardId}
                    allowNone={false}
                    onPick={(pickedBoardId) => {
                        if (pickedBoardId === undefined) {
                            return;
                        }
                        setBoardId(pickedBoardId);
                        setStep('list');
                    }}
                    onCancel={props.onClose}
                />
            ) : (
                <ListPickerBody
                    boardId={boardId}
                    cardId={props.cardId}
                    sourceListId={props.sourceListId}
                    busy={props.busy}
                    actionLabel={props.actionLabel}
                    onConfirm={(listId) => {
                        if (boardId !== undefined) {
                            props.onConfirm(boardId, listId);
                        }
                    }}
                    // Back to the project step rather than closing: the wrong
                    // board is the likeliest reason to be here at all.
                    onCancel={() => setStep('project')}
                />
            )}
        </AppModal>
    );
};

export const BoardListPicker = connect((state: RootState) => ({
    boards: state.kanban.boards,
}))(BoardListPickerInner);
