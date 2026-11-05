import type { PlainMessageKey } from '../../../shared/i18n';
import { Card, KanbanBoard, List } from '../Kanban/type';

/**
 * Reason why starting a fresh focus session deserves an explicit confirmation.
 */
export type FocusStartWarningKind = 'no-project' | 'no-focus-cards';

export interface FocusStartWarning {
    kind: FocusStartWarningKind;
    /** Dictionary keys, translated by the caller (see `Timer.showFocusStartWarning`). */
    titleKey: PlainMessageKey;
    contentKey: PlainMessageKey;
}

const NO_PROJECT_WARNING: { titleKey: PlainMessageKey; contentKey: PlainMessageKey } = {
    titleKey: 'timer.warning.noProjectTitle',
    contentKey: 'timer.warning.noProjectContent',
};

const NO_FOCUS_CARDS_WARNING: { titleKey: PlainMessageKey; contentKey: PlainMessageKey } = {
    titleKey: 'timer.warning.noFocusCardsTitle',
    contentKey: 'timer.warning.noFocusCardsContent',
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

    const cardIds = board.focusedList ? (lists[board.focusedList]?.cards ?? []) : [];
    // Stale card ids (cards deleted after the list was saved) do not count.
    const hasFocusCards = cardIds.some((cardId) => cards[cardId] !== undefined);
    if (!hasFocusCards) {
        return { kind: 'no-focus-cards', ...NO_FOCUS_CARDS_WARNING };
    }

    return undefined;
}

/**
 * Same as {@link getFocusStartWarning}, but honours `Setting.warnBeforeFocusStart`:
 * when the user ticked "Don't remind me again" (or turned the switch off in the
 * settings) no warning is produced at all.
 */
export function getFocusStartWarningIfEnabled(
    enabled: boolean,
    boardId: string | undefined,
    boards: { [boardId: string]: KanbanBoard },
    lists: { [listId: string]: List },
    cards: { [cardId: string]: Card }
): FocusStartWarning | undefined {
    if (!enabled) {
        return undefined;
    }

    return getFocusStartWarning(boardId, boards, lists, cards);
}
