import * as React from 'react';
import { Button } from 'antd';
import styled from 'styled-components';
import { AppModal } from '../AppModal';
import { FEEDBACK_MESSAGES } from '../feedback';
import type { ImportSummary } from '../../../shared/dataTransfer/importSummary';

export interface ImportReportDialogProps {
    open: boolean;
    /** Omitted only before the first report arrives. */
    summary?: ImportSummary;
    onClose: () => void;
    onOpenLogDir: () => void;
    /** Closes the report and opens the data check, which can fix the rest. */
    onCheckData: () => void;
}

const Group = styled.section`
    margin-top: 14px;
`;

const GroupTitle = styled.h4`
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
`;

const Item = styled.div`
    font-size: 13px;
    line-height: 1.7;
`;

const Hint = styled.p`
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--pl-text-secondary);
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

/**
 * What an import left behind, grouped by what the user can do about it.
 *
 * Only counts are shown: the ids, titles and times live in `data.log`, and the
 * "check and repair" panel is where individual rows are handled. The old
 * dialog listed raw paths and promised drops that never happened; this one
 * says what is still in the database and where to deal with it.
 */
export const ImportReportDialog: React.FC<ImportReportDialogProps> = (props) => {
    const copy = FEEDBACK_MESSAGES.setting.importReport;
    const counts = props.summary?.counts;

    const needsAttention = counts
        ? [
              counts.cardsOutsideLists > 0
                  ? copy.cardsOutsideLists(counts.cardsOutsideLists)
                  : undefined,
              counts.deadMoves > 0 ? copy.deadMoves(counts.deadMoves) : undefined,
              counts.danglingSessions > 0
                  ? copy.danglingSessions(counts.danglingSessions)
                  : undefined,
              counts.unknownBoard > 0 ? copy.unknownBoard(counts.unknownBoard) : undefined,
          ].filter((line): line is string => line !== undefined)
        : [];

    return (
        <AppModal
            open={props.open}
            title={copy.title}
            width={560}
            onCancel={props.onClose}
            footer={
                <Footer>
                    <Button onClick={props.onOpenLogDir}>{copy.openLog}</Button>
                    <Button onClick={props.onCheckData}>{copy.checkData}</Button>
                    <Button type="primary" onClick={props.onClose}>
                        {copy.done}
                    </Button>
                </Footer>
            }
        >
            <div>{copy.intro}</div>

            {needsAttention.length > 0 ? (
                <Group>
                    <GroupTitle>{copy.needsAttention}</GroupTitle>
                    {needsAttention.map((label) => (
                        <Item key={label}>{label}</Item>
                    ))}
                </Group>
            ) : undefined}

            {counts !== undefined && counts.noBoard > 0 ? (
                <Group>
                    <GroupTitle>{copy.hint}</GroupTitle>
                    <Item>{copy.noBoard(counts.noBoard)}</Item>
                </Group>
            ) : undefined}

            {counts !== undefined && counts.rehomed > 0 ? (
                <Group>
                    <GroupTitle>{copy.rehomed}</GroupTitle>
                    <Item>{copy.rehomedCards(counts.rehomed)}</Item>
                </Group>
            ) : undefined}

            <Hint>{copy.logHint}</Hint>
        </AppModal>
    );
};
