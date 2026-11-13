import * as React from 'react';
import { Button, Checkbox, Segmented } from 'antd';
import styled from 'styled-components';
import { connect } from 'react-redux';
import { AppModal } from '../AppModal';
import { DAY_EDITOR_WIDTH } from '../dialogLayout';
import { feedback } from '../feedback';
import { CardPicker } from '../Kanban/CardPicker';
import { ProjectPicker } from '../Kanban/ProjectPicker';
import { useI18n } from '../../i18n';
import { formatTimeYMD } from '../Visualization/Timeline';
import type { RootState } from '../../reducers';
import type { PomodoroRecord } from '../../monitor/type';
import type { CardsState } from '../Kanban/Card/action';
import type { KanbanBoardState } from '../Kanban/Board/action';
import type { SessionEdit, SessionEditsResult } from '../../../shared/sessionEdits';
import { applySessionEditsResult } from '../Kanban/sessionEdits';

type Filter = 'all' | 'unassigned' | 'noProject';

/**
 * One row of the draft. Everything the dialog shows is local until Save, so a
 * misclick can be undone and the whole batch lands as one transaction.
 *
 * A session may be counted by more than one card in old data; the row shows the
 * first one and `originalCardIds` keeps the rest so an untouched row is never
 * silently collapsed.
 */
interface DraftRow {
    _id: string;
    startTime: number;
    spentTimeInHour: number;
    boardId?: string;
    cardId?: string;
    originalBoardId?: string;
    originalCardIds: string[];
    deleted: boolean;
}

export interface SessionDayEditorProps {
    open: boolean;
    records: PomodoroRecord[];
    onClose: () => void;
    onSaved: () => void;
}

interface Props extends SessionDayEditorProps {
    boards: KanbanBoardState;
    cards: CardsState;
    /** Copies the transaction's card/board state into the store. */
    applyEdits: (result: SessionEditsResult) => void;
}

type PickerState =
    { kind: 'project'; rowIds: string[] } | { kind: 'card'; rowIds: string[] } | undefined;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
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

const Row = styled.div<{ $deleted: boolean }>`
    display: grid;
    grid-template-columns: 28px 56px 64px minmax(110px, 1fr) minmax(110px, 1fr) 72px;
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

const timeLabel = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Reads which cards count each session. A card has no board of its own, and the
 * session has no card field: the reference only exists on the card.
 */
const indexCardsBySession = (cards: CardsState): Map<string, string[]> => {
    const index = new Map<string, string[]>();
    for (const card of Object.values(cards)) {
        for (const sessionId of card.sessionIds ?? []) {
            const entry = index.get(sessionId);
            if (entry === undefined) {
                index.set(sessionId, [card._id]);
            } else if (!entry.includes(card._id)) {
                entry.push(card._id);
            }
        }
    }
    return index;
};

const buildRows = (records: PomodoroRecord[], cards: CardsState): DraftRow[] => {
    const index = indexCardsBySession(cards);

    return records.map((record) => {
        const cardIds = index.get(record._id) ?? [];
        return {
            _id: record._id,
            startTime: record.startTime,
            spentTimeInHour: record.spentTimeInHour,
            boardId: record.boardId,
            cardId: cardIds[0],
            originalBoardId: record.boardId,
            originalCardIds: cardIds,
            deleted: false,
        };
    });
};

const SessionDayEditorInner = (props: Props) => {
    const { t } = useI18n();
    const [rows, setRows] = React.useState<DraftRow[]>([]);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [filter, setFilter] = React.useState<Filter>('all');
    const [picker, setPicker] = React.useState<PickerState>(undefined);
    const [saving, setSaving] = React.useState(false);

    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (props.open && !wasOpen.current) {
            setRows(buildRows(props.records, props.cards));
            setSelected(new Set());
            setFilter('all');
            setPicker(undefined);
        }
        wasOpen.current = props.open;
    }, [props.open, props.records, props.cards]);

    const cardTitle = React.useCallback(
        (cardId?: string): string => {
            if (cardId === undefined) {
                return t('history.sessionEditor.unassignedCard');
            }
            return props.cards[cardId]?.title ?? t('history.sessionEditor.unassignedCard');
        },
        [props.cards, t]
    );

    const boardTitle = (boardId?: string): string => {
        if (boardId === undefined) {
            return t('history.sessionEditor.noProjectValue');
        }
        return props.boards[boardId]?.name ?? t('history.sessionEditor.unknownProject');
    };

    const isDirty = React.useMemo(
        () =>
            rows.some(
                (row) =>
                    row.deleted ||
                    row.boardId !== row.originalBoardId ||
                    row.cardId !== row.originalCardIds[0]
            ),
        [rows]
    );

    const visibleRows = React.useMemo(() => {
        switch (filter) {
            case 'unassigned':
                return rows.filter((row) => row.cardId === undefined);
            case 'noProject':
                return rows.filter((row) => row.boardId === undefined);
            default:
                return rows;
        }
    }, [rows, filter]);

    const targets = React.useMemo(
        () => rows.filter((row) => selected.has(row._id) && !row.deleted).map((row) => row._id),
        [rows, selected]
    );

    // A card belongs to one board, so a batch card pick only makes sense when
    // every selected record is already in the same project.
    const batchBoardId = React.useMemo(() => {
        if (targets.length === 0) {
            return undefined;
        }
        const boards = new Set(targets.map((id) => rows.find((row) => row._id === id)?.boardId));
        if (boards.size !== 1) {
            return undefined;
        }
        return Array.from(boards)[0];
    }, [targets, rows]);

    const applyProject = (boardId?: string): void => {
        if (picker?.kind !== 'project') {
            return;
        }
        const ids = new Set(picker.rowIds);
        setRows((current) =>
            current.map((row) => {
                if (!ids.has(row._id)) {
                    return row;
                }
                // Going back to the original project restores its original
                // card; a different project drops the card (it cannot follow).
                const sameBoard = boardId === row.originalBoardId;
                return {
                    ...row,
                    boardId,
                    cardId: sameBoard ? row.originalCardIds[0] : undefined,
                };
            })
        );
        setPicker(undefined);
    };

    const applyCard = (cardId?: string): void => {
        if (picker?.kind !== 'card') {
            return;
        }
        const ids = new Set(picker.rowIds);
        setRows((current) => current.map((row) => (ids.has(row._id) ? { ...row, cardId } : row)));
        setPicker(undefined);
    };

    const toggleSelected = (id: string): void => {
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

    const toggleSelectAll = (): void => {
        const eligible = visibleRows.filter((row) => !row.deleted).map((row) => row._id);
        const allSelected = eligible.length > 0 && eligible.every((id) => selected.has(id));
        setSelected(allSelected ? new Set() : new Set(eligible));
    };

    const buildEdits = (): SessionEdit[] => {
        const edits: SessionEdit[] = [];
        for (const row of rows) {
            if (row.deleted) {
                edits.push({ _id: row._id, delete: true });
                continue;
            }

            const edit: SessionEdit = { _id: row._id };
            let changed = false;
            if (row.boardId !== row.originalBoardId) {
                edit.boardId = row.boardId ?? null;
                changed = true;
            }
            if (row.cardId !== row.originalCardIds[0]) {
                edit.cardId = row.cardId ?? null;
                changed = true;
            }
            if (changed) {
                edits.push(edit);
            }
        }
        return edits;
    };

    const requestClose = (): void => {
        if (!isDirty) {
            props.onClose();
            return;
        }
        feedback.confirm({
            kind: 'warning',
            title: t('history.sessionEditor.discardTitle'),
            content: t('history.sessionEditor.discardBody'),
            onOk: props.onClose,
        });
    };

    const onSave = (): void => {
        const edits = buildEdits();
        if (edits.length === 0) {
            feedback.toast({ kind: 'info', content: t('history.sessionEditor.nothingToSave') });
            return;
        }

        const deleted = edits.filter((edit) => edit.delete).length;
        feedback.confirm({
            kind: 'warning',
            title: t('history.sessionEditor.confirmTitle'),
            content: t('history.sessionEditor.confirmBody', edits.length - deleted, deleted),
            onOk: async () => {
                setSaving(true);
                try {
                    const result = await window.api.applySessionEdits(edits);
                    // The store is what this dialog reads its card column from,
                    // so the transaction has to land there too -- otherwise the
                    // next open shows the old cards until a restart.
                    props.applyEdits(result);
                    feedback.toast({ kind: 'success', content: t('history.sessionEditor.saved') });
                    props.onSaved();
                    props.onClose();
                } catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    feedback.alert({
                        kind: 'error',
                        title: t('history.sessionEditor.saveFailed', detail),
                    });
                } finally {
                    setSaving(false);
                }
            },
        });
    };

    const day = rows.length > 0 ? formatTimeYMD(rows[0].startTime) : '';

    return (
        <>
            <AppModal
                open={props.open}
                width={DAY_EDITOR_WIDTH}
                title={t('history.sessionEditor.title', day)}
                onCancel={requestClose}
                footer={
                    <Footer>
                        <Button onClick={requestClose}>{t('history.sessionEditor.cancel')}</Button>
                        <Button type="primary" loading={saving} onClick={onSave}>
                            {t('history.sessionEditor.save')}
                        </Button>
                    </Footer>
                }
            >
                <Toolbar>
                    <Segmented<Filter>
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { label: t('history.sessionEditor.all'), value: 'all' },
                            { label: t('history.sessionEditor.unassigned'), value: 'unassigned' },
                            { label: t('history.sessionEditor.noProject'), value: 'noProject' },
                        ]}
                    />
                    <Button size="small" onClick={toggleSelectAll}>
                        {t('history.sessionEditor.selectAll')}
                    </Button>
                    <span style={{ fontSize: 12, color: 'var(--pl-text-secondary)' }}>
                        {t('history.sessionEditor.selected', selected.size)}
                    </span>
                    <Spacer />
                    <Button
                        size="small"
                        disabled={targets.length === 0}
                        onClick={() => setPicker({ kind: 'project', rowIds: targets })}
                    >
                        {t('history.sessionEditor.batchProject')}
                    </Button>
                    <Button
                        size="small"
                        disabled={targets.length === 0 || batchBoardId === undefined}
                        title={
                            targets.length > 0 && batchBoardId === undefined
                                ? t('history.sessionEditor.batchCardNeedsBoard')
                                : undefined
                        }
                        onClick={() => setPicker({ kind: 'card', rowIds: targets })}
                    >
                        {t('history.sessionEditor.batchCard')}
                    </Button>
                </Toolbar>
                <List>
                    {visibleRows.length === 0 ? (
                        <Empty>{t('history.sessionEditor.empty')}</Empty>
                    ) : (
                        visibleRows.map((row) => (
                            <Row key={row._id} $deleted={row.deleted}>
                                <Checkbox
                                    checked={selected.has(row._id)}
                                    disabled={row.deleted}
                                    onChange={() => toggleSelected(row._id)}
                                />
                                <Cell>{timeLabel(row.startTime)}</Cell>
                                <Cell>{row.spentTimeInHour.toFixed(2)}h</Cell>
                                <Cell>
                                    <LinkButton
                                        type="button"
                                        title={boardTitle(row.boardId)}
                                        onClick={() =>
                                            setPicker({ kind: 'project', rowIds: [row._id] })
                                        }
                                    >
                                        {boardTitle(row.boardId)}
                                    </LinkButton>
                                </Cell>
                                <Cell>
                                    <LinkButton
                                        type="button"
                                        title={cardTitle(row.cardId)}
                                        onClick={() => {
                                            // A card belongs to a board: without a
                                            // project there is nothing to pick from,
                                            // so send the user to the project first.
                                            setPicker(
                                                row.boardId === undefined
                                                    ? { kind: 'project', rowIds: [row._id] }
                                                    : { kind: 'card', rowIds: [row._id] }
                                            );
                                        }}
                                    >
                                        {row.cardId === undefined
                                            ? t('history.sessionEditor.unassignedCard')
                                            : row.originalCardIds.length > 1 &&
                                                row.cardId === row.originalCardIds[0]
                                              ? t(
                                                    'history.sessionEditor.cardMore',
                                                    cardTitle(row.cardId),
                                                    row.originalCardIds.length - 1
                                                )
                                              : cardTitle(row.cardId)}
                                    </LinkButton>
                                </Cell>
                                <Button
                                    size="small"
                                    type="text"
                                    onClick={() =>
                                        setRows((current) =>
                                            current.map((candidate) =>
                                                candidate._id === row._id
                                                    ? { ...candidate, deleted: !candidate.deleted }
                                                    : candidate
                                            )
                                        )
                                    }
                                >
                                    {row.deleted
                                        ? t('history.sessionEditor.undoDelete')
                                        : t('history.sessionEditor.delete')}
                                </Button>
                            </Row>
                        ))
                    )}
                </List>
            </AppModal>

            {/*
             * Siblings of the editor dialog, never its children: these open on
             * top of it, and nesting one dialog inside another makes the inner
             * one's clicks bubble through the outer dialog's tree.
             */}
            <ProjectPicker
                open={picker?.kind === 'project'}
                value={
                    picker?.kind === 'project' && picker.rowIds.length === 1
                        ? rows.find((row) => row._id === picker.rowIds[0])?.boardId
                        : undefined
                }
                onPick={applyProject}
                onClose={() => setPicker(undefined)}
            />
            <CardPicker
                open={picker?.kind === 'card'}
                boardId={
                    picker?.kind === 'card' && picker.rowIds.length === 1
                        ? rows.find((row) => row._id === picker.rowIds[0])?.boardId
                        : batchBoardId
                }
                value={
                    picker?.kind === 'card' && picker.rowIds.length === 1
                        ? rows.find((row) => row._id === picker.rowIds[0])?.cardId
                        : undefined
                }
                onPick={applyCard}
                onClose={() => setPicker(undefined)}
            />
        </>
    );
};

export const SessionDayEditor = connect(
    (state: RootState) => ({
        boards: state.kanban.boards,
        cards: state.kanban.cards,
    }),
    { applyEdits: applySessionEditsResult }
)(SessionDayEditorInner);
