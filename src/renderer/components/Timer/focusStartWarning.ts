import { Card, KanbanBoard, List } from '../Kanban/type';

/**
 * Reason why starting a fresh focus session deserves an explicit confirmation.
 */
export type FocusStartWarningKind = 'no-project' | 'no-focus-cards';

export interface FocusStartWarning {
    kind: FocusStartWarningKind;
    title: string;
    content: string;
}

export const NO_PROJECT_WARNING: { title: string; content: string } = {
    title: 'No focusing project',
    content:
        'You are starting a focus session without selecting a project. ' +
        'The session cannot be linked to any project. Click OK to start anyway.',
};

export const NO_FOCUS_CARDS_WARNING: { title: string; content: string } = {
    title: 'No cards in In Progress',
    content:
        'The "In Progress" list of the selected project is empty. ' +
        'The focus session cannot be linked to any card. Click OK to start anyway.',
};

/**
 * Decide whether starting a fresh focus session needs an explicit
 * confirmation from the user. Returns the warning to show, or `undefined`
 * when the session can start silently.
 *
 * @param boardId the currently selected focusing project (`timer.boardId`)
 * @param boards kanban boards keyed by `_id`
 * @param lists kanban lists keyed by `_id`
 * @param cards kanban cards keyed by `_id`
 */
export function getFocusStartWarning(
    boardId: string | undefined,
    boards: { [boardId: string]: KanbanBoard },
    lists: { [listId: string]: List },
    cards: { [cardId: string]: Card }
): FocusStartWarning | undefined {
    if (boardId === undefined) {
        return { kind: 'no-project', ...NO_PROJECT_WARNING };
    }

    const board = boards[boardId];
    if (board === undefined) {
        return { kind: 'no-project', ...NO_PROJECT_WARNING };
    }

    const cardIds = board.focusedList ? lists[board.focusedList]?.cards ?? [] : [];
    // Stale card ids (cards deleted after the list was saved) do not count.
    const hasFocusCards = cardIds.some((cardId) => cards[cardId] !== undefined);
    if (!hasFocusCards) {
        return { kind: 'no-focus-cards', ...NO_FOCUS_CARDS_WARNING };
    }

    return undefined;
}
