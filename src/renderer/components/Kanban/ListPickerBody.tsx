import * as React from 'react';
import { Button } from 'antd';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { useI18n } from '../../i18n';
import { DIALOG_BODY_MAX_HEIGHT } from '../dialogLayout';
import { PickerFooter } from './PickerFooter';
import { Hint } from '../../../components/common/Hint/Hint';
import type { RootState } from '../../reducers';

export interface ListPickerBodyProps {
    /** Board whose lists are offered. */
    boardId?: string;
    /** The card being moved; used for the "shared sessions" hint. */
    cardId?: string;
    /** The card's current list, which cannot be its destination. */
    sourceListId?: string;
    /** Called with the destination list; the dialog stays open while saving. */
    onConfirm: (listId: string) => void;
    /** Back to the project step; the move flow is two steps, not one dialog. */
    onCancel: () => void;
    busy?: boolean;
    /** Confirm button text; the data check reuses the picker to restore cards. */
    actionLabel?: string;
}

interface Props extends ListPickerBodyProps {
    boards: RootState['kanban']['boards'];
    lists: RootState['kanban']['lists'];
    cards: RootState['kanban']['cards'];
}

/**
 * Same frame as the project and card pickers: `DIALOG_BODY_HEIGHT` fixed, the
 * columns on `flex: 1` with their own scroll, hints and buttons pinned. Both
 * steps of the move flow therefore render at exactly the same height.
 */
const Body = styled.div`
    display: flex;
    flex-direction: column;
    height: ${DIALOG_BODY_MAX_HEIGHT};
`;

const Columns = styled.div`
    display: flex;
    align-items: stretch;
    align-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px;
`;

const ListOption = styled.button<{ $selected: boolean; $disabled: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 140px;
    min-width: 140px;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid ${({ $selected }) => ($selected ? 'transparent' : 'var(--pl-border)')};
    background-color: ${({ $selected }) =>
        $selected ? 'var(--pl-accent)' : 'var(--pl-bg-elevated)'};
    color: ${({ $selected }) => ($selected ? '#fff' : 'var(--pl-text)')};
    font-size: 13px;
    text-align: left;
    cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
    opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};

    &:hover {
        background-color: ${({ $selected, $disabled }) =>
            $selected || $disabled ? undefined : 'var(--pl-bg-hover)'};
    }
`;

const ListTitle = styled.span`
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ListMeta = styled.span<{ $selected: boolean }>`
    font-size: 11px;
    opacity: ${({ $selected }) => ($selected ? 0.85 : 0.7)};
`;

const Hints = styled.div`
    flex: none;
    padding-top: 8px;
`;

const FooterHint = styled.div`
    font-size: 12px;
    line-height: 1.6;
    color: var(--pl-text-secondary);
`;

const ListPickerBodyInner = (props: Props) => {
    const { t } = useI18n();
    const board = props.boardId === undefined ? undefined : props.boards[props.boardId];

    const options = React.useMemo(() => {
        if (board === undefined) {
            return [];
        }
        return (board.lists ?? [])
            .map((listId) => props.lists[listId])
            .filter((list) => list !== undefined)
            .map((list) => ({
                list,
                count: (list.cards ?? []).length,
                focused: board.focusedList === list._id,
                done: board.doneList === list._id,
                disabled: list._id === props.sourceListId,
            }));
    }, [board, props.lists, props.sourceListId]);

    const firstEnabled = options.find((option) => !option.disabled)?.list._id;
    // Default to the focused list (that is where a running pomodoro would look
    // for the card), falling back to the first list that is not the source.
    // Derived instead of copied into state: the store can deliver a new `lists`
    // object while the dialog is open, and a stored default would then fight
    // whatever the user just clicked.
    const preferred = board?.focusedList;
    const defaultListId =
        preferred !== undefined &&
        preferred !== props.sourceListId &&
        options.some((option) => option.list._id === preferred)
            ? preferred
            : firstEnabled;
    const [picked, setPicked] = React.useState<string | undefined>();
    const selected = picked ?? defaultListId;

    const card = props.cardId === undefined ? undefined : props.cards[props.cardId];
    const sessionCount = card === undefined ? 0 : new Set(card.sessionIds ?? []).size;
    // Sessions that another card counts too: the move takes them away from
    // that card, which is what keeps a session from being billed twice.
    const sharedCount =
        card === undefined
            ? 0
            : Array.from(new Set(card.sessionIds ?? [])).filter((sessionId) =>
                  Object.values(props.cards).some(
                      (other) =>
                          other._id !== card._id && (other.sessionIds ?? []).includes(sessionId)
                  )
              ).length;

    return (
        <Body>
            <Columns role="listbox" aria-label={t('kanban.cardMove.listTitle', board?.name ?? '')}>
                {options.map((option) => (
                    <Hint key={option.list._id} label={option.list.title}>
                        <ListOption
                            type="button"
                            role="option"
                            aria-selected={option.list._id === selected}
                            $selected={option.list._id === selected}
                            $disabled={option.disabled}
                            disabled={option.disabled}
                            onClick={() => setPicked(option.list._id)}
                        >
                            <ListTitle>
                                {option.list.title}
                                {option.focused ? ' ★' : ''}
                                {option.done ? ' ✓' : ''}
                            </ListTitle>
                            <ListMeta $selected={option.list._id === selected}>
                                {t('kanban.list.cardCount', option.count)}
                            </ListMeta>
                        </ListOption>
                    </Hint>
                ))}
            </Columns>
            {card !== undefined ? (
                <Hints>
                    <FooterHint>{t('kanban.cardMove.sessions', sessionCount)}</FooterHint>
                    {sharedCount > 0 ? (
                        <FooterHint>{t('kanban.cardMove.shared', sharedCount)}</FooterHint>
                    ) : undefined}
                    <FooterHint>{t('kanban.cardMove.irreversible')}</FooterHint>
                </Hints>
            ) : (
                <Hints>
                    <FooterHint>{t('kanban.cardMove.irreversible')}</FooterHint>
                </Hints>
            )}
            <PickerFooter>
                <Button onClick={props.onCancel}>{t('kanban.cardMove.cancel')}</Button>
                <Button
                    type="primary"
                    disabled={selected === undefined || props.busy}
                    loading={props.busy}
                    onClick={() => {
                        if (selected !== undefined) {
                            props.onConfirm(selected);
                        }
                    }}
                >
                    {props.actionLabel ?? t('kanban.cardMove.confirm')}
                </Button>
            </PickerFooter>
        </Body>
    );
};

/**
 * Second step of "move card to…": pick the destination list inside the board
 * chosen in the {@link ProjectPickerBody}. It is a body rather than a dialog so
 * both steps can live in one `AppModal`; two dialogs taking turns stack their
 * masks for a frame and the background flashes darker at every step.
 */
export const ListPickerBody = connect((state: RootState) => ({
    boards: state.kanban.boards,
    lists: state.kanban.lists,
    cards: state.kanban.cards,
}))(ListPickerBodyInner);
