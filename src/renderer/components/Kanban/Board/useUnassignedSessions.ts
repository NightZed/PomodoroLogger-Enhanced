import * as React from 'react';
import type { UnassignedSessionSummary } from '../../../../shared/sessionEdits';

export interface UnassignedSessionsState {
    rows: UnassignedSessionSummary[];
    total: number;
    reload: () => Promise<void>;
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

    React.useEffect(() => {
        void reload();
    }, [reload]);

    return { rows, total, reload };
};
