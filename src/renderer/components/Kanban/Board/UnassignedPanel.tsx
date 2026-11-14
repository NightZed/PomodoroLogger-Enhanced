import * as React from 'react';
import { Button, Checkbox } from 'antd';
import styled from 'styled-components';
import { AppModal } from '../../AppModal';
import { DAY_EDITOR_WIDTH } from '../../dialogLayout';
import { CardPicker } from '../CardPicker';
import { feedback } from '../../feedback';
import { useI18n } from '../../../i18n';
import { PomodoroNumView } from '../../Timer/PomodoroNumView';
import type { PomodoroRecord } from '../../../monitor/type';
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
    /** Reads one session with its app detail; the list rows are summaries. */
    loadRecord: (id: string) => Promise<PomodoroRecord | undefined>;
    /** Opens the fullscreen Sankey overlay for that session. */
    chooseRecord: (record: PomodoroRecord) => void;
}

/** What the dialog shows for one row until Save; absent means "unchanged". */
interface DraftRow {
    cardId?: string;
    deleted: boolean;
}

const Hint = styled.p`
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--pl-text-secondary);
`;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
`;

const Spacer = styled.div`
    flex: 1;
`;

const List = styled.div`
    max-height: 380px;
    overflow-y: auto;
    border-top: 1px solid var(--pl-border);
`;

/**
 * Same skeleton as the History day editor (the two are one click apart in the
 * user's head), minus the project column: every row here already has a board.
 */
const Row = styled.div<{ $deleted: boolean }>`
    display: grid;
    grid-template-columns: 28px 24px 92px 64px minmax(0, 1fr) 72px;
    align-items: center;
    gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--pl-border);
    font-size: 13px;
    opacity: ${({ $deleted }) => ($deleted ? 0.45 : 1)};
    text-decoration: ${({ $deleted }) => ($deleted ? 'line-through' : 'none')};
`;

const Cell = styled.div`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const DotCell = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
`;

const LinkButton = styled.button`
    max-width: 100%;
    padding: 2px 4px;
    border: none;
    border-bottom: 1px dashed var(--pl-border);
    background: transparent;
    color: var(--pl-text);
    font-size: 13px;
    text-align: left;
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
    justify-content: flex-end;
    gap: 8px;
`;

const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** Day and time: the list spans several days, unlike the History day editor. */
const dayTimeLabel = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours()
    )}:${pad(date.getMinutes())}`;
};

/**
 * The board's "unassigned pomodoros" dialog.
 *
 * It shares `PomodoroNumView`, `CardPicker` and `applySessionEdits` with the
 * History day editor, so both entry points behave the same: card picks and
 * deletion marks are drafts until Save, and closing with unsaved changes asks
 * first. The pomodoro dot opens the same Sankey overlay the History dot does.
 */
export const UnassignedPanel = (props: UnassignedPanelProps) => {
    const { t } = useI18n();
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    /** Card picks and deletion marks, applied only on Save. */
    const [draft, setDraft] = React.useState<Map<string, DraftRow>>(new Map());
    const [pickerFor, setPickerFor] = React.useState<string[] | undefined>(undefined);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!props.open) {
            setSelected(new Set());
            setDraft(new Map());
        }
    }, [props.open]);

    const isDeleted = (id: string): boolean => draft.get(id)?.deleted === true;
    const cardIdOf = (id: string): string | undefined => draft.get(id)?.cardId;

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

    const selectable = props.rows.filter((row) => !isDeleted(row._id));
    const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row._id));
    const toggleSelectAll = (): void => {
        setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row._id)));
    };

    const toggleDelete = (id: string): void => {
        setDraft((current) => {
            const next = new Map(current);
            const previous = next.get(id) ?? { deleted: false };
            if (previous.deleted) {
                // Back to the stored state: a row that never had a pick needs
                // no draft entry at all.
                if (previous.cardId === undefined) {
                    next.delete(id);
                } else {
                    next.set(id, { ...previous, deleted: false });
                }
            } else {
                next.set(id, { ...previous, deleted: true });
            }
            return next;
        });
        setSelected((current) => {
            if (!current.has(id)) {
                return current;
            }
            const next = new Set(current);
            next.delete(id);
            return next;
        });
    };

    const applyCard = (cardId?: string): void => {
        if (pickerFor === undefined) {
            return;
        }
        setDraft((current) => {
            const next = new Map(current);
            for (const id of pickerFor) {
                const previous = next.get(id) ?? { deleted: false };
                if (cardId === undefined) {
                    // "No card" is this list's normal state, so it clears the
                    // draft instead of storing an explicit null.
                    if (previous.deleted) {
                        next.set(id, { ...previous, cardId: undefined });
                    } else {
                        next.delete(id);
                    }
                } else {
                    next.set(id, { ...previous, cardId });
                }
            }
            return next;
        });
        setPickerFor(undefined);
    };

    const openSankey = async (id: string): Promise<void> => {
        const record = await props.loadRecord(id);
        if (record === undefined) {
            feedback.toast({ kind: 'error', content: t('kanban.unassigned.recordMissing') });
            return;
        }
        props.chooseRecord(record);
    };

    const requestClose = (): void => {
        if (draft.size === 0) {
            props.onClose();
            return;
        }
        feedback.confirm({
            title: t('kanban.unassigned.discardTitle'),
            content: t('kanban.unassigned.discardBody'),
            onOk: props.onClose,
        });
    };

    const save = (): void => {
        const edits: SessionEdit[] = [];
        let deletedCount = 0;
        for (const [id, row] of draft) {
            if (row.deleted) {
                edits.push({ _id: id, delete: true });
                deletedCount += 1;
            } else if (row.cardId !== undefined) {
                edits.push({ _id: id, cardId: row.cardId });
            }
        }
        if (edits.length === 0) {
            feedback.toast({ kind: 'info', content: t('kanban.unassigned.nothingToSave') });
            return;
        }

        feedback.confirm({
            title: t('kanban.unassigned.confirmTitle'),
            content: t('kanban.unassigned.confirmBody', edits.length - deletedCount, deletedCount),
            onOk: async () => {
                setSaving(true);
                try {
                    const result = await window.api.applySessionEdits(edits);
                    props.applyEdits?.(result);
                    feedback.toast({ kind: 'success', content: t('kanban.unassigned.saved') });
                    setDraft(new Map());
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
                width={DAY_EDITOR_WIDTH}
                open={props.open}
                onCancel={requestClose}
                footer={
                    <Footer>
                        <Button onClick={requestClose}>{t('kanban.unassigned.cancel')}</Button>
                        <Button type="primary" loading={saving} onClick={save}>
                            {t('kanban.unassigned.save')}
                        </Button>
                    </Footer>
                }
            >
                <Hint>{t('kanban.unassigned.hint')}</Hint>
                {props.rows.length === 0 ? (
                    <Empty>{t('kanban.unassigned.empty')}</Empty>
                ) : (
                    <>
                        <Toolbar>
                            <Button size="small" onClick={toggleSelectAll}>
                                {t('kanban.unassigned.selectAll')}
                            </Button>
                            <span style={{ fontSize: 12, color: 'var(--pl-text-secondary)' }}>
                                {t('kanban.unassigned.selected', selected.size)}
                            </span>
                            <Spacer />
                            <Button
                                size="small"
                                disabled={selected.size === 0}
                                onClick={() => setPickerFor(Array.from(selected))}
                            >
                                {t('kanban.unassigned.assignTo')}
                            </Button>
                        </Toolbar>
                        <List>
                            {props.rows.map((row) => (
                                <Row key={row._id} $deleted={isDeleted(row._id)}>
                                    <Checkbox
                                        checked={selected.has(row._id)}
                                        disabled={isDeleted(row._id)}
                                        onChange={() => toggle(row._id)}
                                    />
                                    <DotCell>
                                        <PomodoroNumView
                                            pomodoros={[
                                                {
                                                    _id: row._id,
                                                    startTime: row.startTime,
                                                } as PomodoroRecord,
                                            ]}
                                            showNum={false}
                                            inline
                                            chooseRecord={() => {
                                                void openSankey(row._id);
                                            }}
                                        />
                                    </DotCell>
                                    <Cell>{dayTimeLabel(row.startTime)}</Cell>
                                    <Cell>{row.spentTimeInHour.toFixed(2)}h</Cell>
                                    <Cell>
                                        <LinkButton
                                            type="button"
                                            title={
                                                cardIdOf(row._id) === undefined
                                                    ? t('kanban.unassigned.noCard')
                                                    : cardTitle(cardIdOf(row._id)!)
                                            }
                                            disabled={isDeleted(row._id)}
                                            onClick={() => setPickerFor([row._id])}
                                        >
                                            {cardIdOf(row._id) === undefined
                                                ? t('kanban.unassigned.noCard')
                                                : cardTitle(cardIdOf(row._id)!)}
                                        </LinkButton>
                                    </Cell>
                                    <Button
                                        size="small"
                                        type="text"
                                        onClick={() => toggleDelete(row._id)}
                                    >
                                        {isDeleted(row._id)
                                            ? t('kanban.unassigned.undoDelete')
                                            : t('kanban.unassigned.delete')}
                                    </Button>
                                </Row>
                            ))}
                        </List>
                        {props.total > props.rows.length ? (
                            <Hint>
                                {t('kanban.unassigned.more', props.total - props.rows.length)}
                            </Hint>
                        ) : undefined}
                    </>
                )}
            </AppModal>
            <CardPicker
                open={pickerFor !== undefined}
                boardId={props.boardId}
                value={
                    pickerFor !== undefined && pickerFor.length === 1
                        ? cardIdOf(pickerFor[0])
                        : undefined
                }
                onPick={applyCard}
                onClose={() => setPickerFor(undefined)}
            />
        </>
    );
};
