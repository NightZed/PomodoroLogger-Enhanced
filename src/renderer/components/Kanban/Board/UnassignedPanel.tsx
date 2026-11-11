import * as React from 'react';
import { Button, Checkbox } from 'antd';
import styled from 'styled-components';
import { AppModal } from '../../AppModal';
import { CardPicker } from '../CardPicker';
import { feedback } from '../../feedback';
import { useI18n } from '../../../i18n';
import { formatTimeYmdHm } from '../../Visualization/Timeline';
import type { CardsState } from '../Card/action';
import type { SessionEdit, SessionEditsResult } from '../../../../shared/sessionEdits';
import type { UnassignedSessionSummary } from '../../../../shared/sessionEdits';

export interface UnassignedPanelProps {
    boardId: string;
    boardName: string;
    open: boolean;
    onClose: () => void;
    /** The page's unassigned list, read by `useUnassignedSessions`. */
    rows: UnassignedSessionSummary[];
    total: number;
    /** Re-reads the list after a successful assignment. */
    onSaved: () => void;
    /** Copies the transaction's card state back into the store. */
    applyEdits?: (result: SessionEditsResult) => void;
    cards: CardsState;
}

const Hint = styled.p`
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--pl-text-secondary);
`;

const List = styled.div`
    max-height: 400px;
    overflow-y: auto;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 6px 2px;
    border-bottom: 1px solid var(--pl-border);
    font-size: 13px;
`;

const RowText = styled.div`
    min-width: 0;
`;

const RowTime = styled.div`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowMeta = styled.div`
    font-size: 12px;
    color: var(--pl-text-secondary);
`;

const LinkButton = styled.button`
    max-width: 140px;
    padding: 2px 4px;
    border: none;
    border-bottom: 1px dashed var(--pl-border);
    background: transparent;
    color: var(--pl-text);
    font-size: 13px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
        background-color: var(--pl-bg-hover);
    }
`;

const Empty = styled.div`
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
`;

const SelectedCount = styled.span`
    margin-right: auto;
    font-size: 12px;
    color: var(--pl-text-secondary);
`;

const Body = styled.div`
    display: flex;
    flex-direction: column;
`;

/**
 * The board's "unassigned pomodoros" drawer: sessions that no card counts.
 *
 * It shares `CardPicker` and `applySessionEdits` with the History editor, but
 * deliberately offers no project change or deletion -- those belong to the
 * per-day dialog, so a record never has two different edit entry points.
 */
export const UnassignedPanel = (props: UnassignedPanelProps) => {
    const { t } = useI18n();
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    /** Card picks made in the drawer, applied only on Save. */
    const [picked, setPicked] = React.useState<Map<string, string>>(new Map());
    const [pickerFor, setPickerFor] = React.useState<string[] | undefined>(undefined);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!props.open) {
            setSelected(new Set());
            setPicked(new Map());
        }
    }, [props.open]);

    const cardTitle = (cardId: string): string =>
        props.cards[cardId]?.title ?? t('kanban.unassigned.noCard');

    const toggle = (id: string): void => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const pickCard = (cardId?: string): void => {
        if (pickerFor === undefined) {
            return;
        }
        if (cardId === undefined) {
            setPicked((current) => {
                const next = new Map(current);
                for (const id of pickerFor) {
                    next.delete(id);
                }
                return next;
            });
        } else {
            setPicked((current) => {
                const next = new Map(current);
                for (const id of pickerFor) {
                    next.set(id, cardId);
                }
                return next;
            });
        }
        setPickerFor(undefined);
    };

    const save = (): void => {
        const edits: SessionEdit[] = Array.from(picked, ([_id, cardId]) => ({ _id, cardId }));
        if (edits.length === 0) {
            feedback.toast({ kind: 'info', content: t('kanban.unassigned.nothingPicked') });
            return;
        }

        feedback.confirm({
            title: t('kanban.unassigned.confirmTitle'),
            content: t('kanban.unassigned.confirmBody', edits.length),
            onOk: async () => {
                setSaving(true);
                try {
                    const result = await window.api.applySessionEdits(edits);
                    props.applyEdits?.(result);
                    feedback.toast({ kind: 'success', content: t('kanban.unassigned.saved') });
                    setPicked(new Map());
                    setSelected(new Set());
                    props.onSaved();
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    feedback.alert({
                        kind: 'error',
                        title: t('kanban.unassigned.saveFailed', detail),
                    });
                } finally {
                    setSaving(false);
                }
            },
        });
    };

    return (
        <>
            <AppModal
                title={t('kanban.unassigned.title', props.boardName)}
                width={620}
                open={props.open}
                onCancel={props.onClose}
                footer={
                    <Footer>
                        <SelectedCount>
                            {t('kanban.unassigned.selected', selected.size)}
                        </SelectedCount>
                        <Button
                            onClick={() => setPickerFor(Array.from(selected))}
                            disabled={selected.size === 0}
                        >
                            {t('kanban.unassigned.assignTo')}
                        </Button>
                        <Button type="primary" loading={saving} onClick={save}>
                            {t('kanban.unassigned.save')}
                        </Button>
                    </Footer>
                }
            >
                <Body>
                    <Hint>{t('kanban.unassigned.hint')}</Hint>
                    {props.rows.length === 0 ? (
                        <Empty>{t('kanban.unassigned.empty')}</Empty>
                    ) : (
                        <List>
                            {props.rows.map((row) => (
                                <Row key={row._id}>
                                    <Checkbox
                                        checked={selected.has(row._id)}
                                        onChange={() => toggle(row._id)}
                                    />
                                    <RowText>
                                        <RowTime>{formatTimeYmdHm(row.startTime)}</RowTime>
                                        <RowMeta data-testid={`unassigned-meta-${row._id}`}>
                                            {row.spentTimeInHour.toFixed(2)}h ·{' '}
                                            {t('kanban.unassigned.appCount', row.appCount)}
                                        </RowMeta>
                                    </RowText>
                                    <LinkButton
                                        type="button"
                                        data-testid={`unassigned-card-${row._id}`}
                                        onClick={() => setPickerFor([row._id])}
                                    >
                                        {picked.has(row._id)
                                            ? cardTitle(picked.get(row._id)!)
                                            : t('kanban.unassigned.noCard')}
                                    </LinkButton>
                                </Row>
                            ))}
                        </List>
                    )}
                    {props.total > props.rows.length ? (
                        <RowMeta>
                            {t('kanban.unassigned.more', props.total - props.rows.length)}
                        </RowMeta>
                    ) : undefined}
                </Body>
            </AppModal>
            <CardPicker
                open={pickerFor !== undefined}
                boardId={props.boardId}
                value={
                    pickerFor !== undefined && pickerFor.length === 1
                        ? picked.get(pickerFor[0])
                        : undefined
                }
                onPick={pickCard}
                onClose={() => setPickerFor(undefined)}
            />
        </>
    );
};
