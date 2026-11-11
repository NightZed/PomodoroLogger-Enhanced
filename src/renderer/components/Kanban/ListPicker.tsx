import * as React from 'react';
import { Button } from 'antd';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { AppModal } from '../AppModal';
import { useI18n } from '../../i18n';
import type { RootState } from '../../reducers';

export interface ListPickerProps {
    open: boolean;
    /** Board whose lists are offered. */
    boardId?: string;
    /** The card being moved; used for the "shared sessions" hint. */
    cardId?: string;
    /** The card's current list, which cannot be its destination. */
    sourceListId?: string;
    /** Called with the destination list; the dialog stays open while saving. */
    onMove: (listId: string) => void;
    onCancel: () => void;
    busy?: boolean;
}

interface Props extends ListPickerProps {
    boards: RootState['kanban']['boards'];
    lists: RootState['kanban']['lists'];
    cards: RootState['kanban']['cards'];
}

const Columns = styled.div`
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
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

const Hint = styled.div`
    font-size: 12px;
    line-height: 1.6;
    color: var(--pl-text-secondary);
`;

const FooterRow = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const ListPickerInner = (props: Props) => {
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
    React.useEffect(() => {
        if (props.open) {
            setPicked(undefined);
        }
    }, [props.open]);
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
        <AppModal
            open={props.open}
            title={t('kanban.cardMove.listTitle', board?.name ?? '')}
            onCancel={props.onCancel}
            zIndex={1100}
            width={560}
            footer={
                <FooterRow>
                    <Button onClick={props.onCancel}>{t('kanban.cardMove.cancel')}</Button>
                    <Button
                        type="primary"
                        disabled={selected === undefined || props.busy}
                        loading={props.busy}
                        onClick={() => {
                            if (selected !== undefined) {
                                props.onMove(selected);
                            }
                        }}
                    >
                        {t('kanban.cardMove.confirm')}
                    </Button>
                </FooterRow>
            }
        >
            <Columns>
                {options.map((option) => (
                    <ListOption
                        key={option.list._id}
                        type="button"
                        $selected={option.list._id === selected}
                        $disabled={option.disabled}
                        disabled={option.disabled}
                        title={option.list.title}
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
                ))}
            </Columns>
            <Hint>{t('kanban.cardMove.sessions', sessionCount)}</Hint>
            {sharedCount > 0 ? <Hint>{t('kanban.cardMove.shared', sharedCount)}</Hint> : undefined}
            <Hint>{t('kanban.cardMove.irreversible')}</Hint>
        </AppModal>
    );
};

/**
 * Second step of "move card to…": pick the destination list inside the board
 * chosen in `ProjectPicker`. It is a separate dialog because the board has to
 * be decided first — the list set only exists once the board does — and the
 * same dialog serves the same-board case (the source list is just disabled).
 */
export const ListPicker = connect((state: RootState) => ({
    boards: state.kanban.boards,
    lists: state.kanban.lists,
    cards: state.kanban.cards,
}))(ListPickerInner);
