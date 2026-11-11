import type { Card, KanbanBoard } from '../renderer/components/Kanban/type';

/**
 * One difference the session editor wants to apply. The renderer only sends
 * the diff; the main process owns the reads, the unbinding and the writes.
 *
 * `undefined` means "leave it alone" and `null` means "detach" -- the two have
 * to stay distinct, or "keep the card" would be indistinguishable from "remove
 * the card".
 */
export interface SessionEdit {
    _id: string;
    /** Remove the session row itself. Every other field is ignored. */
    delete?: boolean;
    /** `null` detaches the session from its project (History shows `Unknown`). */
    boardId?: string | null;
    /** `null` detaches the session from its card. */
    cardId?: string | null;
}

/** The session's final project, for callers that keep a local copy. */
export interface EditedSession {
    _id: string;
    boardId?: string;
}

export interface SessionEditsResult {
    /** Sessions that were removed. */
    deleted: string[];
    sessions: EditedSession[];
    /**
     * Cards whose `sessionIds` or `actual` changed. The renderer replaces them
     * wholesale instead of re-adding hours, so float drift cannot accumulate.
     */
    updatedCards: { [id: string]: Card };
    /** Boards whose `spentHours` / `relatedSessions` changed. */
    updatedBoards: { [id: string]: KanbanBoard };
}

export interface UnassignedSessionsQuery {
    /** Restrict to one board; omitted means every board plus unattributed. */
    boardId?: string;
    /** Page size. The total is always returned separately. */
    limit?: number;
}

export interface UnassignedSessionSummary {
    _id: string;
    startTime: number;
    spentTimeInHour: number;
    appCount: number;
}

export interface UnassignedSessionsResult {
    total: number;
    sessions: UnassignedSessionSummary[];
}
