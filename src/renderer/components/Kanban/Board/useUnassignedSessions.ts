import * as React from 'react';
import { dbs } from '../../../dbs';
import type { PomodoroRecord } from '../../../monitor/type';
import type { UnassignedSessionSummary } from '../../../../shared/sessionEdits';

export interface UnassignedSessionsState {
    rows: UnassignedSessionSummary[];
    total: number;
    reload: () => Promise<void>;
    /**
     * One session with its app/title detail, for the Sankey chart. The list
     * only carries a summary (that is what keeps 200 rows cheap), so the chart
     * reads the row back by id when the user asks for it.
     */
    loadRecord: (id: string) => Promise<PomodoroRecord | undefined>;
}

/**
 * Reads the sessions of one board that no card counts.
 *
 * Kept outside the panel so the board header's count and the panel's list come
 * from the same read, and so the panel itself stays a plain presentational
 * component (easy to test without a store or a live IPC bridge).
 */
export const useUnassignedSessions = (boardId?: string): UnassignedSessionsState => {
    const [rows, setRows] = React.useState<UnassignedSessionSummary[]>([]);
    const [total, setTotal] = React.useState(0);

    const reload = React.useCallback(async () => {
        if (boardId === undefined) {
            setRows([]);
            setTotal(0);
            return;
        }

        try {
            const result = await window.api.listUnassignedSessions({ boardId });
            setRows(result.sessions);
            setTotal(result.total);
        } catch {
            // A failed refresh is not a reason to blank the list on screen.
        }
    }, [boardId]);

    const loadRecord = React.useCallback(
        async (id: string): Promise<PomodoroRecord | undefined> =>
            ((await dbs.sessionDB.findOne({ _id: id })) as PomodoroRecord | null) ?? undefined,
        []
    );

    React.useEffect(() => {
        void reload();
    }, [reload]);

    return { rows, total, reload, loadRecord };
};
