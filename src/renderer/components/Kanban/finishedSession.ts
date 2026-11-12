import { createAction } from '@reduxjs/toolkit';
import type { FinishedSessionResult } from '../../../shared/finishedSession';

/**
 * The main process wrote a finished pomodoro and credited it to its board and
 * card. The payload carries the rows it touched, so the reducers replace them
 * instead of replaying the increments: the store then shows exactly what the
 * database holds, and a failed write leaves no optimistic hours behind.
 *
 * Only `board` and `card` are mapped. The session row has no store slice --
 * History reads it from the database when the page mounts.
 */
export const applyFinishedSession = createAction(
    '[Kanban]APPLY_FINISHED_SESSION',
    (result: FinishedSessionResult) => ({ payload: result })
);
