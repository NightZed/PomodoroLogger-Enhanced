import { createAction } from '@reduxjs/toolkit';
import type { DataRepairResult } from '../../../shared/dataRepair';

/**
 * The data check deleted or repaired rows in the main process.
 *
 * One action for the whole result: a repair can delete a card, rewrite another
 * list's `cards`, and drop a board's dead list references at the same time. The
 * reducers replace the returned rows instead of re-deriving which arrays changed
 * -- reading the affected rows back from the database would mean a second
 * request, and patching them here would need the same scanning logic twice.
 */
export const applyDataRepair = createAction(
    '[Kanban]APPLY_DATA_REPAIR',
    (result: DataRepairResult) => ({ payload: result })
);
