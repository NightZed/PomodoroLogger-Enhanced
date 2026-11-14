import { DBs, loadDBs, runInTransaction } from './index';
import type { SqliteRepository } from './repository';
import { roundHours } from '../../shared/hours';
import { logError } from '../log';
import type { Card, KanbanBoard } from '../../renderer/components/Kanban/type';
import type { FinishedSessionPayload, FinishedSessionResult } from '../../shared/finishedSession';

/**
 * One finished pomodoro, one transaction.
 *
 * The order matters: the session row is written first, then the board and the
 * card are credited. Previously these were three separate writes and the
 * session insert's rejection was swallowed by `sessionManager.addSession`, so
 * a failed insert still pushed the id into `board.relatedSessions` and
 * `card.sessionIds`. That is one of the ways a card ends up naming a session
 * that does not exist; the other was the pre-transaction import.
 *
 * A missing board or card is not an error. Both can be deleted while the
 * pomodoro is running, and dropping the session because its project vanished
 * would lose the user's focus time. The session keeps its `boardId`
 * (History shows `Unknown`), and the data check lets the user assign it again.
 *
 * A duplicate `_id` is an error: the caller must not credit the same session
 * twice, and silently treating the retry as success would hide a real bug.
 */
export async function recordFinishedSession(
    payload: FinishedSessionPayload
): Promise<FinishedSessionResult> {
    await loadDBs(['sessionDB', 'kanbanDB', 'cardsDB']);

    const sessionsRepo = DBs.sessionDB as unknown as SqliteRepository;
    const boardsRepo = DBs.kanbanDB as unknown as SqliteRepository;
    const cardsRepo = DBs.cardsDB as unknown as SqliteRepository;

    const session = payload.session;

    // Reads happen before the transaction opens: a rejected write leaves the
    // database untouched, and a read failure cannot leave a half-opened one.
    if (sessionsRepo.findSync({ _id: session._id }).length > 0) {
        throw new Error(`session ${session._id} already exists`);
    }

    const board =
        session.boardId === undefined
            ? undefined
            : boardsRepo.findSync<KanbanBoard>({ _id: session.boardId })[0];
    const card =
        payload.cardId === undefined
            ? undefined
            : cardsRepo.findSync<Card>({ _id: payload.cardId })[0];

    const spentTime = session.spentTimeInHour ?? 0;
    const now = Date.now();

    let updatedBoard: KanbanBoard | undefined;
    let updatedCard: Card | undefined;

    try {
        runInTransaction(() => {
            sessionsRepo.insertSync(session);

            if (board !== undefined) {
                const nextBoard: KanbanBoard = {
                    ...board,
                    // A session is counted once. Rewriting the array instead of
                    // `$push` keeps a retried or replayed id from inflating the
                    // board's session list.
                    relatedSessions: [
                        ...(board.relatedSessions ?? []).filter((id) => id !== session._id),
                        session._id,
                    ],
                    spentHours: roundHours((board.spentHours ?? 0) + spentTime),
                    lastVisitTime: now,
                };
                updatedBoard = nextBoard;
                boardsRepo.updateSync(
                    { _id: board._id },
                    {
                        $set: {
                            relatedSessions: nextBoard.relatedSessions,
                            spentHours: nextBoard.spentHours,
                            lastVisitTime: now,
                        },
                    }
                );
            }

            if (card !== undefined) {
                const nextCard: Card = {
                    ...card,
                    sessionIds: [
                        ...(card.sessionIds ?? []).filter((id) => id !== session._id),
                        session._id,
                    ],
                    spentTimeInHour: {
                        estimated: card.spentTimeInHour?.estimated ?? 0,
                        actual: roundHours((card.spentTimeInHour?.actual ?? 0) + spentTime),
                    },
                };
                updatedCard = nextCard;
                cardsRepo.updateSync(
                    { _id: card._id },
                    {
                        $set: {
                            sessionIds: nextCard.sessionIds,
                            'spentTimeInHour.actual': nextCard.spentTimeInHour.actual,
                        },
                    }
                );
            }
        });
    } catch (error) {
        // The renderer shows a toast; the log is what a bug report can carry.
        logError('data', `finished session ${session._id} was not saved`, error);
        throw error;
    }

    return { session, board: updatedBoard, card: updatedCard };
}
