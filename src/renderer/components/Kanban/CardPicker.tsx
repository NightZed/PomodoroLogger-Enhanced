import * as React from 'react';
import { Button } from 'antd';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { AppModal } from '../AppModal';
import { useI18n } from '../../i18n';
import type { RootState } from '../../reducers';

export interface CardPickerProps {
    open: boolean;
    /** The board whose cards are offered. Without one there is nothing to pick. */
    boardId?: string;
    value?: string;
    /** `undefined` means "no card": the session stays unattributed. */
    onPick: (cardId?: string) => void;
    onClose: () => void;
    /**
     * The Timer's ending mask is a full-viewport fixed layer at z-index 1000;
     * a dialog opened from it has to sit above that, or it renders behind it.
     */
    zIndex?: number;
}

interface Props extends CardPickerProps {
    boards: RootState['kanban']['boards'];
    lists: RootState['kanban']['lists'];
    cards: RootState['kanban']['cards'];
}

const Columns = styled.div`
    display: flex;
    gap: 12px;
    max-height: 360px;
    overflow-x: auto;
    overflow-y: hidden;
`;

const Column = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 0 160px;
    min-width: 160px;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
`;

const ColumnTitle = styled.div`
    position: sticky;
    top: 0;
    padding: 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--pl-text-secondary);
    background-color: var(--pl-bg-elevated);
`;

const CardOption = styled.button<{ $selected: boolean }>`
    display: block;
    width: 100%;
    padding: 5px 8px;
    border-radius: 4px;
    border: 1px solid ${({ $selected }) => ($selected ? 'transparent' : 'var(--pl-border)')};
    background-color: ${({ $selected }) =>
        $selected ? 'var(--pl-accent)' : 'var(--pl-bg-elevated)'};
    color: ${({ $selected }) => ($selected ? '#fff' : 'var(--pl-text)')};
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
        background-color: ${({ $selected }) => ($selected ? 'var(--pl-accent)' : 'var(--pl-bg-hover)')};
    }
`;

const Empty = styled.div`
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const FooterRow = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 8px;
`;

const CardPickerInner = (props: Props) => {
    const { t } = useI18n();
    const board = props.boardId === undefined ? undefined : props.boards[props.boardId];

    // The picker mirrors the board: one column per list, in board order. A list
    // whose cards are all gone is dropped so the dialog does not open full of
    // empty columns.
    const columns = React.useMemo(() => {
        if (board === undefined) {
            return [];
        }

        return (board?.lists ?? [])
            .map((listId) => props.lists[listId])
            .filter((list) => list !== undefined)
            .map((list) => ({
                list,
                cards: list.cards
                    .map((cardId) => props.cards[cardId])
                    .filter((card) => card !== undefined),
            }))
            .filter((column) => column.cards.length > 0);
    }, [board, props.lists, props.cards]);

    const isEmpty = columns.length === 0;

    return (
        <AppModal
            open={props.open}
            title={t('kanban.cardPicker.title', board?.name ?? '')}
            onCancel={props.onClose}
            zIndex={props.zIndex ?? 1100}
            footer={
                <FooterRow>
                    <Button onClick={() => props.onPick(undefined)}>
                        {t('kanban.cardPicker.noCard')}
                    </Button>
                    <Button onClick={props.onClose}>{t('kanban.cardPicker.cancel')}</Button>
                </FooterRow>
            }
        >
            {isEmpty ? (
                <Empty>{t('kanban.cardPicker.empty')}</Empty>
            ) : (
                <Columns>
                    {columns.map((column) => (
                        <Column key={column.list._id}>
                            <ColumnTitle>{column.list.title}</ColumnTitle>
                            {column.cards.map((card) => (
                                <CardOption
                                    key={card._id}
                                    type="button"
                                    $selected={card._id === props.value}
                                    title={card.title}
                                    onClick={() => props.onPick(card._id)}
                                >
                                    {card.title || t('kanban.cardPicker.untitled')}
                                </CardOption>
                            ))}
                        </Column>
                    ))}
                </Columns>
            )}
        </AppModal>
    );
};

/**
 * Shared card chooser: the Timer's ending mask uses it to decide which card a
 * finished focus session belongs to, and the History session editor reuses it
 * to (re)assign one after the fact. It is a dialog rather than a dropdown
 * because a board can hold many lists and the columns have to stay readable.
 */
export const CardPicker = connect((state: RootState) => ({
    boards: state.kanban.boards,
    lists: state.kanban.lists,
    cards: state.kanban.cards,
}))(CardPickerInner);
