/**
 * A label as stored on a card (or collected board-wide). For suggestion
 * purposes only the name matters; the color is carried along untouched.
 */
export interface NamedLabel {
    name: string;
}

/**
 * Suggest board-wide labels for the card editor's label input.
 *
 * - Labels already on the card are dropped: picking one would only trigger
 *   the "label already exists" warning in the LabelEditor.
 * - `input` filters with a case-insensitive substring match (trimmed), so a
 *   blank input yields every remaining label -- the dropdown shows the whole
 *   board palette instead of the old 8-item cap.
 * - Duplicate names collapse to their first occurrence (the same color the
 *   board editor keeps), which also keeps the rendered Option keys unique.
 * - The result is ordered alphabetically (`localeCompare`) so the list stays
 *   scannable no matter in which order the labels were created.
 *
 * Pure: does not mutate `boardLabels`.
 */
export const getLabelSuggestions = <T extends NamedLabel>(
    boardLabels: readonly T[],
    labelsOnCard: readonly NamedLabel[],
    input: string
): T[] => {
    const usedNames = new Set(labelsOnCard.map((label) => label.name));
    const query = input.trim().toLowerCase();
    const seen = new Set<string>();
    const matched: T[] = [];
    for (const label of boardLabels) {
        const { name } = label;
        if (usedNames.has(name) || seen.has(name)) {
            continue;
        }

        if (!name.toLowerCase().includes(query)) {
            continue;
        }

        seen.add(name);
        matched.push(label);
    }

    return matched.sort((a, b) => a.name.localeCompare(b.name));
};
