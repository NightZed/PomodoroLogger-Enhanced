import { extractTags } from './Card/formatMarkdown';
import { Card, KanbanBoard, List } from './type';

/**
 * The `#TAGS` group of the board's search panel.
 *
 * One unified pool: content `#tags` (extracted straight from each card's
 * current markdown via extractTags -- always fresh, nothing registry-stale)
 * and card labels share the same `#name` key and are ordered by a single
 * metric: the number of DISTINCT cards of the board carrying the tag. A tag
 * repeated inside one card's content, or a name that exists both as a label
 * and a content tag of the same card, counts that card once. Ties order
 * alphabetically (localeCompare -- the comparator the card editor's label
 * dropdown uses, labelSuggestion.ts) so the panel stays stable.
 *
 * Pure: does not mutate its arguments.
 */
export const getBoardSearchTags = (
    board: KanbanBoard,
    lists: { [listId: string]: List | undefined },
    cards: { [cardId: string]: Card | undefined }
): string[] => {
    const counts = new Map<string, Set<string>>();
    for (const listId of board.lists) {
        for (const cardId of lists[listId]?.cards ?? []) {
            const card = cards[cardId];
            if (!card) {
                continue;
            }

            // One set per card: the same key on one card counts its id once.
            const keys = new Set<string>();
            for (const tag of extractTags(card.content ?? '')) {
                keys.add(tag);
            }
            for (const label of card.labels ?? []) {
                keys.add('#' + label.name);
            }

            for (const key of keys) {
                let holders = counts.get(key);
                if (!holders) {
                    holders = new Set<string>();
                    counts.set(key, holders);
                }
                holders.add(cardId);
            }
        }
    }

    return Array.from(counts.entries())
        .map(([key, holders]): [string, number] => [key, holders.size])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key]) => key);
};

export default getBoardSearchTags;
