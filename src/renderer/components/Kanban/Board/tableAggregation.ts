import type { KanbanBoardState } from './action';
import type { CardsState } from '../Card/action';
import type { Card, ListsState } from '../type';

export interface AggBoardInfo {
    _id: string;
    name: string;
    estimatedLeftTimeSum: number;
    actualTimeSum: number;
    pomodoroCount: number;
    meanPercentageError?: number;
}

/**
 * PURE: the table's rows. It must never write to the Redux card objects -- the
 * old implementation set `card.isDone` here while rendering.
 */
export const aggregateBoardRows = (
    boards: KanbanBoardState,
    listsById: ListsState,
    cardsById: CardsState
): AggBoardInfo[] =>
    Object.values(boards).map((board) => {
        const { name, lists, relatedSessions, _id } = board;
        const cards: { card: Card; isDone: boolean }[] = [];
        for (const listId of lists) {
            const list = listsById[listId];
            if (!list) {
                continue;
            }

            const isDone = listId === board.doneList;
            for (const cardId of list.cards) {
                const card = cardsById[cardId];
                if (!card) {
                    continue;
                }

                // Keep the flag on this temporary row instead of on the store
                // object. See the comment above.
                cards.push({ card, isDone });
            }
        }

        const [estimatedLeftTimeSum, actualTimeSum, errorSum, n] = cards.reduce(
            (l: number[], { card, isDone }) => {
                let err = 0;
                const { actual, estimated } = card.spentTimeInHour;
                if (isDone && actual !== 0 && estimated !== 0) {
                    err = (Math.abs(estimated - actual) / actual) * 100;
                }

                return [
                    l[0] + (isDone ? 0 : Math.max(0, estimated - actual)),
                    l[1] + actual,
                    l[2] + err,
                    l[3] + (isDone ? 1 : 0),
                ];
            },
            [0, 0, 0, 0]
        );

        return {
            _id,
            name,
            estimatedLeftTimeSum,
            actualTimeSum,
            meanPercentageError: n ? errorSum / n : undefined,
            pomodoroCount: (relatedSessions ?? []).length,
        };
    });
