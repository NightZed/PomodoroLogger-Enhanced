import * as React from 'react';
import { Button, Checkbox } from 'antd';
import styled from 'styled-components';
import { AppModal } from '../AppModal';
import { feedback } from '../feedback';
import { useI18n } from '../../i18n';
import { formatTimeYmdHm } from '../Visualization/Timeline';
import type { TranslateFn } from '../../../shared/i18n';
import type {
    SessionHourEntry,
    SessionHourGroup,
    SessionHoursReport,
} from '../../../shared/sessionHours';

export interface AppHoursCalibrationDialogProps {
    open: boolean;
    onClose: () => void;
    /** Called after a successful calibration so the store/history reload. */
    onRepaired: () => void;
}

const GroupHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 14px 0 2px;
`;

const GroupTitle = styled.h4`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
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
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
`;

const SessionId = styled.code`
    font-family: monospace;
    font-size: 12px;
    user-select: text;
`;

const StartedAt = styled.span`
    font-size: 11px;
    color: var(--pl-text-secondary);
`;

const RowMeta = styled.div`
    font-size: 11px;
    color: var(--pl-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

/**
 * One fixed body height for every state (loading, empty, report).
 *
 * The scan is quick but not instant, and the dialog has no fixed height of its
 * own: a 70px "loading" placeholder followed by a 52vh report reads as the
 * window growing after it opened. Giving the placeholder the same box means
 * the dialog is already at its final size on the first paint.
 */
const Scroller = styled.div`
    height: 52vh;
    overflow-y: auto;
    padding-right: 4px;
`;

const Empty = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 52vh;
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

/**
 * Wall-clock durations for the preview.
 *
 * The dialog shows differences from half a second (normal drift) to hours
 * (a suspended machine), so a single unit is unreadable at one end. Rounding
 * to the nearest second at the minute boundary can carry into 60, which is
 * why the carry is handled before choosing the shape.
 */
const formatDuration = (seconds: number, t: TranslateFn): string => {
    const abs = Math.abs(seconds);
    if (abs < 60) {
        return t('appHours.seconds', abs.toFixed(1));
    }

    let totalMinutes = Math.floor(abs / 60);
    let rest = Math.round(abs - totalMinutes * 60);
    if (rest === 60) {
        totalMinutes += 1;
        rest = 0;
    }
    if (totalMinutes < 60) {
        return rest === 0
            ? t('appHours.minutes', totalMinutes)
            : t('appHours.minutesSeconds', totalMinutes, rest);
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? t('appHours.hours', hours) : t('appHours.hoursMinutes', hours, minutes);
};

const deltaText = (entry: SessionHourEntry, kind: 'over' | 'under' | 'missing', t: TranslateFn) => {
    if (kind === 'missing') {
        return `${t('appHours.deltaUnattributed')} ${formatDuration(entry.deltaSeconds, t)}`;
    }
    return kind === 'over'
        ? `${t('appHours.deltaMore')} ${formatDuration(entry.deltaSeconds, t)}`
        : `${t('appHours.deltaLess')} ${formatDuration(Math.abs(entry.deltaSeconds), t)}`;
};

const emptyGroup: SessionHourGroup = { total: 0, totalDeltaSeconds: 0, preview: [] };

const EMPTY_REPORT: SessionHoursReport = {
    over: emptyGroup,
    under: emptyGroup,
    missing: emptyGroup,
};

const AppHoursCalibrationDialogInner = (props: AppHoursCalibrationDialogProps) => {
    const { t } = useI18n();
    const { open } = props;
    const [report, setReport] = React.useState<SessionHoursReport>();
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [selection, setSelection] = React.useState({ over: false, under: false });

    // A fresh scan on every open: the report the data check holds may be
    // minutes old, and the calibration is cheap enough (one json_each query)
    // that reusing a snapshot would buy nothing.
    React.useEffect(() => {
        if (!open) {
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setReport(undefined);
        window.api
            .scanSessionHours()
            .then((next) => {
                if (cancelled) {
                    return;
                }
                setReport(next);
                // Only `over` starts checked: a shorter breakdown is also the
                // shape a hand-edited record takes, so the user opts in.
                setSelection({ over: next.over.total > 0, under: false });
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return;
                }
                feedback.alert({
                    kind: 'error',
                    title: t('appHours.scanFailed'),
                    content: t(
                        'appHours.failedDetail',
                        error instanceof Error ? error.message : String(error)
                    ),
                });
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [open, t]);

    const value = report ?? EMPTY_REPORT;
    const selectedCount =
        (selection.over ? value.over.total : 0) + (selection.under ? value.under.total : 0);
    const isEmpty = value.over.total === 0 && value.under.total === 0 && value.missing.total === 0;

    const toggle = (kind: 'over' | 'under', checked: boolean) =>
        setSelection((current) => ({ ...current, [kind]: checked }));

    const apply = (): void => {
        if (selectedCount === 0) {
            return;
        }

        feedback.confirm({
            kind: 'warning',
            title: t('appHours.confirmTitle'),
            content: (
                <div>
                    {selection.over ? (
                        <div>· {t('appHours.confirmOver', value.over.total)}</div>
                    ) : undefined}
                    {selection.under ? (
                        <div>· {t('appHours.confirmUnder', value.under.total)}</div>
                    ) : undefined}
                    <div style={{ marginTop: 8 }}>{t('appHours.confirmNote')}</div>
                </div>
            ),
            okText: t('appHours.confirmOk'),
            onOk: async () => {
                setBusy(true);
                try {
                    const result = await window.api.recalibrateSessionHours({
                        over: selection.over,
                        under: selection.under,
                    });
                    feedback.toast({
                        kind: 'success',
                        content: t('appHours.done', result.repaired, result.skipped),
                    });
                    props.onRepaired();
                    props.onClose();
                } catch (error) {
                    feedback.alert({
                        kind: 'error',
                        title: t('appHours.failed'),
                        content: t(
                            'appHours.failedDetail',
                            error instanceof Error ? error.message : String(error)
                        ),
                    });
                } finally {
                    setBusy(false);
                }
            },
        });
    };

    const rows = (entries: SessionHourEntry[], kind: 'over' | 'under' | 'missing') =>
        entries.map((entry) => (
            <Row key={entry.sessionId}>
                <RowBody>
                    <RowTitle>
                        <SessionId>{entry.sessionId}</SessionId>
                        <StartedAt>{formatTimeYmdHm(entry.startTime)}</StartedAt>
                    </RowTitle>
                    <RowMeta>
                        {t('appHours.sessionTotal')} {formatDuration(entry.sessionHours * 3600, t)}
                        {' · '}
                        {t('appHours.appTotal')} {formatDuration(entry.appHours * 3600, t)}
                        {' · '}
                        {deltaText(entry, kind, t)}
                    </RowMeta>
                </RowBody>
            </Row>
        ));

    const group = (kind: 'over' | 'under', data: SessionHourGroup): React.ReactNode => (
        <>
            <GroupHeader>
                <GroupTitle>
                    {kind === 'over'
                        ? t('appHours.over', data.total)
                        : t('appHours.under', data.total)}
                </GroupTitle>
                <Checkbox
                    checked={selection[kind]}
                    disabled={data.total === 0 || busy}
                    onChange={(event) => toggle(kind, event.target.checked)}
                >
                    {t('appHours.selectGroup')}
                </Checkbox>
            </GroupHeader>
            <Note>
                {kind === 'over'
                    ? t('appHours.overNote', formatDuration(data.totalDeltaSeconds, t))
                    : t('appHours.underNote', formatDuration(data.totalDeltaSeconds, t))}
            </Note>
            {rows(data.preview, kind)}
        </>
    );

    return (
        <AppModal
            open={open}
            title={t('appHours.title')}
            width={680}
            onCancel={props.onClose}
            footer={
                <Footer>
                    <SelectedCount>{t('appHours.selected', selectedCount)}</SelectedCount>
                    <FooterButtons>
                        <Button onClick={props.onClose} disabled={busy}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="primary"
                            loading={busy}
                            disabled={selectedCount === 0 || loading}
                            onClick={apply}
                        >
                            {t('appHours.apply', selectedCount)}
                        </Button>
                    </FooterButtons>
                </Footer>
            }
        >
            {loading ? (
                <Empty>{t('appHours.loading')}</Empty>
            ) : isEmpty ? (
                <Empty>{t('appHours.empty')}</Empty>
            ) : (
                <Scroller>
                    <Note>{t('appHours.intro')}</Note>
                    {group('over', value.over)}
                    {group('under', value.under)}
                    {value.missing.total > 0 ? (
                        <>
                            <GroupHeader>
                                <GroupTitle>
                                    {t('appHours.missing', value.missing.total)}
                                </GroupTitle>
                            </GroupHeader>
                            <Note>
                                {t(
                                    'appHours.missingNote',
                                    formatDuration(value.missing.totalDeltaSeconds, t)
                                )}
                            </Note>
                            {rows(value.missing.preview, 'missing')}
                        </>
                    ) : undefined}
                </Scroller>
            )}
        </AppModal>
    );
};

export const AppHoursCalibrationDialog = React.memo(AppHoursCalibrationDialogInner);
