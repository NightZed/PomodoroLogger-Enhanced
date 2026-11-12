import type { Card, KanbanBoard } from '../renderer/components/Kanban/type';
import type { PomodoroRecord } from '../renderer/monitor/type';

/**
 * A pomodoro that just ended and has to reach the database.
 *
 * The session is written first and then credited to its project and card. The
 * renderer used to do this as three independent writes (insert the session,
 * `$push` the board, `$push` the card) with the insert's failure swallowed, so
 * a failed insert still credited an id that no session row backed -- the
 * "sessionId without a session" rows old builds left behind.
 *
 * `cardId` is the single card the session belongs to. `boardId` is not a
 * parameter: it is `session.boardId`, because that field is what the History
 * page reads to decide a session's project.
 */
export interface FinishedSessionPayload {
    session: PomodoroRecord;
    cardId?: string;
}

/**
 * The post-write state of everything the transaction touched. The renderer
 * replaces these rows wholesale instead of replaying the increments, so its
 * store cannot drift from the database on float rounding.
 */
export interface FinishedSessionResult {
    session: PomodoroRecord;
    /** Present only when the session's board still exists. */
    board?: KanbanBoard;
    /** Present only when the picked card still exists. */
    card?: Card;
}
