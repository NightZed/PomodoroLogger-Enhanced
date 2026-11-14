import * as React from 'react';
import { Button, Checkbox } from 'antd';
import styled from 'styled-components';
import { AppModal } from '../AppModal';
import { feedback } from '../feedback';
import { useI18n } from '../../i18n';
import { RestoreCardsDialog } from '../Kanban/RestoreCardsDialog';
import type {
    CardIssue,
    DanglingRefIssue,
    DataIssuesReport,
    DataRepairPayload,
    DataRepairResult,
} from '../../../shared/dataRepair';
import type { TranslateFn } from '../../../shared/i18n';

/** Rows rendered per group until "show all" is clicked. */
const MAX_ROWS = 50;
/** Ids shown under one dangling row before "show more" is clicked. */
const MAX_IDS = 5;

export interface DataRepairDialogProps {
    open: boolean;
    report: DataIssuesReport;
    onClose: () => void;
    /** Re-runs the scan after a restore or a repair. */
    onRescan: () => void;
    applyRepair: (result: DataRepairResult) => void;
    /** Opens the app-hours calibration, which is a separate sweep. */
    onOpenAppHours?: () => void;
}

const GroupHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 14px 0 4px;
`;

const GroupTitle = styled.h4`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
`;

const SubTitle = styled.h5`
    margin: 10px 0 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--pl-text-secondary);
`;

const Note = styled.p`
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--pl-text-secondary);
`;

const Row = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
`;

const RowBody = styled.div`
    flex: 1 1 auto;
    min-width: 0;
`;

const RowTitle = styled.div`
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowMeta = styled.div`
    font-size: 11px;
    color: var(--pl-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

/** A dangling row's heading: long enough that it wraps instead of truncating. */
const RefTitle = styled.div`
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
`;

const OwnerId = styled.span`
    margin-left: 6px;
    font-family: monospace;
    font-size: 11px;
    color: var(--pl-text-secondary);
`;

/** One id per line: the only handle a dead reference still has. */
const IdList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 2px 0 0 24px;
`;

const IdLine = styled.code`
    font-family: monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--pl-text-secondary);
    user-select: text;
`;

const MoreIds = styled(Button)`
    && {
        height: auto;
        margin-left: 20px;
        padding: 0 4px;
        font-size: 11px;
    }
`;

const Scroller = styled.div`
    max-height: 52vh;
    overflow-y: auto;
    padding-right: 4px;
`;

const Empty = styled.div`
    padding: 32px;
    text-align: center;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const FooterButtons = styled.div`
    display: flex;
    gap: 8px;
`;

const SelectedCount = styled.span`
    font-size: 12px;
    color: var(--pl-text-secondary);
`;

const cardKey = (id: string): string => `card:${id}`;
const refKey = (issue: DanglingRefIssue): string => `ref:${issue.kind}:${issue.ownerId}`;
const MOVES_KEY = 'moves';

const reportKeys = (report: DataIssuesReport): string[] => {
    const keys = [
        ...report.detachedCards.map((card) => cardKey(card._id)),
        ...report.orphanCards.map((card) => cardKey(card._id)),
        ...report.lists.map((list) => `list:${list._id}`),
        ...report.dangling.map(refKey),
    ];
    if (report.moves.total > 0) {
        keys.push(MOVES_KEY);
    }
    return keys;
};

/** The one-line sentence that names the owner and how many entries go. */
const refText = (issue: DanglingRefIssue, t: TranslateFn): string =>
    issue.kind === 'boardLists'
        ? t('dataRepair.danglingBoardLists', issue.ownerTitle, issue.count)
        : issue.kind === 'listCards'
          ? t('dataRepair.danglingListCards', issue.ownerTitle, issue.count)
          : t('dataRepair.danglingCardSessions', issue.ownerTitle, issue.count);

const cardMeta = (issue: CardIssue, t: TranslateFn): string => {
    const parts: string[] = [];
    if (issue.spentHours > 0) {
        parts.push(`${Number(issue.spentHours.toFixed(2))}h`);
    }
    if (issue.sessionCount > 0) {
        parts.push(t('dataRepair.sessions', issue.sessionCount));
    }
    if (parts.length === 0) {
        parts.push(t('dataRepair.noRecord'));
    }
    // The id is the only stable handle a user can quote in a bug report, and
    // titles are editable (two "调研" cards are otherwise indistinguishable).
    parts.push(issue._id);
    const meta = parts.join(' · ');
    return issue.listTitle === undefined ? meta : `${issue.listTitle} · ${meta}`;
};

const DataRepairDialogInner = (props: DataRepairDialogProps) => {
    const { t } = useI18n();
    const { report } = props;

    const defaultSelection = React.useCallback((value: DataIssuesReport): Set<string> => {
        const next = new Set<string>();
        // Cards left behind by an old "delete the board row" land here, and the
        // user meant to be rid of them; cards no list names may be an accident
        // (a crash mid-drag), so they start unchecked and offer a restore.
        for (const card of value.detachedCards) {
            next.add(cardKey(card._id));
        }
        for (const list of value.lists) {
            next.add(`list:${list._id}`);
        }
        if (value.moves.total > 0) {
            next.add(MOVES_KEY);
        }
        for (const issue of value.dangling) {
            next.add(refKey(issue));
        }
        return next;
    }, []);

    const [selected, setSelected] = React.useState<Set<string>>(() => defaultSelection(report));
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    // Which rows have revealed all of their dangling ids. Kept apart from
    // `expanded` (which reveals more rows), because a row can be shown while
    // its id list is still folded.
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);
    const [restoreIds, setRestoreIds] = React.useState<string[] | undefined>();
    const initialized = React.useRef(false);

    // Opening applies the defaults. A later rescan must NOT re-apply them: the
    // user may have deliberately unchecked a row that is still there, and
    // silently checking it again would make the next Apply delete it.
    React.useEffect(() => {
        if (!props.open) {
            initialized.current = false;
            return;
        }
        if (!initialized.current) {
            initialized.current = true;
            setSelected(defaultSelection(report));
            setExpanded(new Set());
            setExpandedIds(new Set());
            return;
        }
        const valid = new Set(reportKeys(report));
        setSelected((current) => new Set([...current].filter((key) => valid.has(key))));
    }, [props.open, report, defaultSelection]);

    const toggle = (key: string): void => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const toggleAll = (keys: string[], all: boolean): void => {
        setSelected((current) => {
            const next = new Set(current);
            for (const key of keys) {
                if (all) {
                    next.add(key);
                } else {
                    next.delete(key);
                }
            }
            return next;
        });
    };

    const groupHeader = (title: string, keys: string[]): React.ReactNode => {
        const checked = keys.length > 0 && keys.every((key) => selected.has(key));
        const some = keys.some((key) => selected.has(key));
        return (
            <GroupHeader>
                <GroupTitle>{title}</GroupTitle>
                <Checkbox
                    checked={checked}
                    indeterminate={!checked && some}
                    disabled={keys.length === 0}
                    onChange={(event) => toggleAll(keys, event.target.checked)}
                >
                    {t('dataRepair.selectAll')}
                </Checkbox>
            </GroupHeader>
        );
    };

    /** Rows a group shows before "show all" is clicked. */
    const visibleRows = <T,>(group: string, rows: T[]): T[] =>
        expanded.has(group) ? rows : rows.slice(0, MAX_ROWS);

    const showAllButton = (group: string, total: number): React.ReactNode =>
        expanded.has(group) || total <= MAX_ROWS ? undefined : (
            <Button
                type="link"
                size="small"
                onClick={() => setExpanded((current) => new Set(current).add(group))}
            >
                {t('dataRepair.showAll', total - MAX_ROWS)}
            </Button>
        );

    /**
     * The dead ids under one dangling row. A single broken import can leave a
     * card naming hundreds of sessions, so the list starts folded; the owner
     * row stays the unit that is repaired.
     */
    const refIdRows = (issue: DanglingRefIssue): React.ReactNode => {
        const key = refKey(issue);
        const allVisible = expandedIds.has(key);
        const shown = allVisible ? issue.ids : issue.ids.slice(0, MAX_IDS);
        const hidden = issue.ids.length - shown.length;

        return (
            <>
                <IdList>
                    {shown.map((entry) => (
                        <IdLine key={entry.id}>
                            {entry.id}
                            {entry.times > 1 ? ` ×${entry.times}` : ''}
                        </IdLine>
                    ))}
                </IdList>
                {hidden > 0 ? (
                    <MoreIds
                        type="link"
                        size="small"
                        onClick={() => setExpandedIds((current) => new Set(current).add(key))}
                    >
                        {t('dataRepair.moreIds', hidden)}
                    </MoreIds>
                ) : undefined}
            </>
        );
    };

    const cardRows = (group: string, cards: CardIssue[]): React.ReactNode => (
        <>
            {visibleRows(group, cards).map((card) => (
                <Row key={card._id}>
                    <Checkbox
                        aria-label={card.title || t('dataRepair.untitled')}
                        checked={selected.has(cardKey(card._id))}
                        onChange={() => toggle(cardKey(card._id))}
                    />
                    <RowBody>
                        <RowTitle title={card.title}>
                            {card.title || t('dataRepair.untitled')}
                        </RowTitle>
                        <RowMeta>{cardMeta(card, t)}</RowMeta>
                    </RowBody>
                    <Button size="small" onClick={() => setRestoreIds([card._id])}>
                        {t('dataRepair.restore')}
                    </Button>
                </Row>
            ))}
            {showAllButton(group, cards.length)}
        </>
    );

    const detachedKeys = report.detachedCards.map((card) => cardKey(card._id));
    const orphanKeys = report.orphanCards.map((card) => cardKey(card._id));
    const listKeys = report.lists.map((list) => `list:${list._id}`);
    const moveKeys = report.moves.total > 0 ? [MOVES_KEY] : [];
    const danglingKeys = report.dangling.map(refKey);

    const selectedCardKeys = [...detachedKeys, ...orphanKeys].filter((key) => selected.has(key));
    const selectedCardIds = selectedCardKeys.map((key) => key.slice('card:'.length));
    const selectedCardCount = selectedCardIds.length;
    const selectedListIds = listKeys
        .filter((key) => selected.has(key))
        .map((key) => key.slice('list:'.length));
    const refIds = (kind: DanglingRefIssue['kind']): string[] =>
        report.dangling
            .filter((issue) => issue.kind === kind && selected.has(refKey(issue)))
            .map((issue) => issue.ownerId);
    const selectedRefCount = danglingKeys.filter((key) => selected.has(key)).length;
    const deleteCount =
        selectedCardCount + selectedListIds.length + (selected.has(MOVES_KEY) ? 1 : 0);

    const appHoursCount = (report.appHours?.over ?? 0) + (report.appHours?.under ?? 0);

    const hasAnyIssue =
        report.detachedCards.length > 0 ||
        report.orphanCards.length > 0 ||
        report.lists.length > 0 ||
        report.moves.total > 0 ||
        report.dangling.length > 0 ||
        appHoursCount > 0;

    const runRepair = async (payload: DataRepairPayload): Promise<DataRepairResult | undefined> => {
        setBusy(true);
        try {
            const result = await window.api.repairData(payload);
            props.applyRepair(result);
            props.onRescan();
            return result;
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            feedback.alert({
                kind: 'error',
                title: t('dataRepair.failed'),
                content: t('dataRepair.failedDetail', detail),
            });
            return undefined;
        } finally {
            setBusy(false);
        }
    };

    /**
     * One action, one confirmation window. The dialog cannot know whether the
     * user reads "apply" as "delete" or "fix", so it shows exactly what this
     * selection will do before touching the database -- even when the selection
     * only repairs references and deletes nothing.
     */
    const apply = (): void => {
        if (selected.size === 0) {
            return;
        }

        const payload: DataRepairPayload = {
            cardIds: selectedCardIds,
            listIds: selectedListIds,
            removeOrphanMoves: selected.has(MOVES_KEY),
            listCardRefIds: refIds('listCards'),
            boardListRefIds: refIds('boardLists'),
            cardSessionRefIds: refIds('cardSessions'),
        };

        feedback.confirm({
            kind: 'warning',
            title: t('dataRepair.confirmTitle'),
            content: (
                <div>
                    {deleteCount > 0 ? (
                        <>
                            <div>{t('dataRepair.confirmDelete')}</div>
                            {selectedCardCount > 0 ? (
                                <div>· {t('dataRepair.confirmCards', selectedCardCount)}</div>
                            ) : undefined}
                            {selectedListIds.length > 0 ? (
                                <div>· {t('dataRepair.confirmLists', selectedListIds.length)}</div>
                            ) : undefined}
                            {selected.has(MOVES_KEY) ? (
                                <div>· {t('dataRepair.confirmMoves', report.moves.total)}</div>
                            ) : undefined}
                        </>
                    ) : undefined}
                    {selectedRefCount > 0 ? (
                        <>
                            <div>{t('dataRepair.confirmRepair')}</div>
                            <div>· {t('dataRepair.confirmRefs', selectedRefCount)}</div>
                        </>
                    ) : undefined}
                    <div style={{ marginTop: 8 }}>{t('dataRepair.confirmNote')}</div>
                </div>
            ),
            okText: t('dataRepair.confirmOk'),
            onOk: async () => {
                const result = await runRepair(payload);
                if (result === undefined) {
                    return;
                }
                feedback.toast({
                    kind: 'success',
                    content: t(
                        'dataRepair.done',
                        result.removedCards.length,
                        result.removedLists.length,
                        result.removedMoves,
                        result.repairedRefs
                    ),
                });
            },
        });
    };

    return (
        <AppModal
            open={props.open}
            title={t('dataRepair.title')}
            width={680}
            onCancel={props.onClose}
            footer={
                <Footer>
                    <SelectedCount>{t('dataRepair.selected', selected.size)}</SelectedCount>
                    <FooterButtons>
                        <Button onClick={props.onClose}>{t('common.cancel')}</Button>
                        <Button
                            type="primary"
                            danger={deleteCount > 0}
                            loading={busy}
                            disabled={selected.size === 0}
                            onClick={apply}
                        >
                            {t('dataRepair.applySelected', selected.size)}
                        </Button>
                    </FooterButtons>
                </Footer>
            }
        >
            {!hasAnyIssue ? (
                <Empty>{t('dataRepair.empty')}</Empty>
            ) : (
                <Scroller>
                    <Note>{t('dataRepair.intro')}</Note>

                    {appHoursCount > 0 ? (
                        <>
                            <Note style={{ marginTop: 8 }}>
                                {t('dataRepair.appHoursNote', appHoursCount)}
                            </Note>
                            {props.onOpenAppHours ? (
                                <Button size="small" onClick={props.onOpenAppHours}>
                                    {t('dataRepair.appHoursOpen')}
                                </Button>
                            ) : undefined}
                        </>
                    ) : undefined}

                    {report.detachedCards.length > 0 || report.orphanCards.length > 0 ? (
                        <>
                            <GroupHeader style={{ marginTop: 8 }}>
                                <GroupTitle>{t('dataRepair.cards')}</GroupTitle>
                                <Button
                                    size="small"
                                    disabled={selectedCardCount === 0 || busy}
                                    onClick={() => setRestoreIds(selectedCardIds)}
                                >
                                    {t('dataRepair.restoreSelected', selectedCardCount)}
                                </Button>
                            </GroupHeader>
                            {report.detachedCards.length > 0 ? (
                                <>
                                    {groupHeader(
                                        t('dataRepair.detachedGroup', report.detachedCards.length),
                                        detachedKeys
                                    )}
                                    {cardRows('detached', report.detachedCards)}
                                </>
                            ) : undefined}
                            {report.orphanCards.length > 0 ? (
                                <>
                                    <SubTitle>
                                        {t('dataRepair.orphanGroup', report.orphanCards.length)}
                                    </SubTitle>
                                    <Checkbox
                                        checked={
                                            orphanKeys.length > 0 &&
                                            orphanKeys.every((key) => selected.has(key))
                                        }
                                        indeterminate={
                                            orphanKeys.some((key) => selected.has(key)) &&
                                            !orphanKeys.every((key) => selected.has(key))
                                        }
                                        onChange={(event) =>
                                            toggleAll(orphanKeys, event.target.checked)
                                        }
                                    >
                                        {t('dataRepair.selectAll')}
                                    </Checkbox>
                                    {cardRows('orphan', report.orphanCards)}
                                </>
                            ) : undefined}
                        </>
                    ) : undefined}

                    {report.lists.length > 0 ? (
                        <>
                            {groupHeader(t('dataRepair.lists', report.lists.length), listKeys)}
                            <Note>{t('dataRepair.listNote')}</Note>
                            {visibleRows('lists', report.lists).map((list) => (
                                <Row key={list._id}>
                                    <Checkbox
                                        checked={selected.has(`list:${list._id}`)}
                                        onChange={() => toggle(`list:${list._id}`)}
                                    />
                                    <RowBody>
                                        <RowTitle title={list.title}>{list.title}</RowTitle>
                                        <RowMeta>{list._id}</RowMeta>
                                    </RowBody>
                                </Row>
                            ))}
                            {showAllButton('lists', report.lists.length)}
                        </>
                    ) : undefined}

                    {report.moves.total > 0 ? (
                        <>
                            {groupHeader(t('dataRepair.moves', report.moves.total), moveKeys)}
                            <Note>{t('dataRepair.movesNote', report.moves.cardCount)}</Note>
                        </>
                    ) : undefined}

                    {report.dangling.length > 0 ? (
                        <>
                            {groupHeader(
                                t('dataRepair.dangling', report.dangling.length),
                                danglingKeys
                            )}
                            <Note>{t('dataRepair.danglingNote')}</Note>
                            {visibleRows('dangling', report.dangling).map((issue) => (
                                <Row key={refKey(issue)}>
                                    <Checkbox
                                        checked={selected.has(refKey(issue))}
                                        onChange={() => toggle(refKey(issue))}
                                    />
                                    <RowBody>
                                        <RefTitle>
                                            {refText(issue, t)}
                                            <OwnerId>{issue.ownerId}</OwnerId>
                                        </RefTitle>
                                        {refIdRows(issue)}
                                    </RowBody>
                                </Row>
                            ))}
                            {showAllButton('dangling', report.dangling.length)}
                        </>
                    ) : undefined}
                </Scroller>
            )}

            <RestoreCardsDialog
                open={restoreIds !== undefined}
                cardIds={restoreIds ?? []}
                onClose={() => setRestoreIds(undefined)}
                onRestored={() => props.onRescan()}
            />
        </AppModal>
    );
};

/**
 * The "Check & Repair Data" dialog.
 *
 * Every row is a choice, not a notification: the old version reported only
 * totals, so a user could not tell whether the sweep was about to delete a month
 * of notes. Cards keep their titles, each card can be restored, and the dangling
 * kinds say explicitly that repairing them removes a reference rather than the
 * row it points at.
 */
export const DataRepairDialog = DataRepairDialogInner;
