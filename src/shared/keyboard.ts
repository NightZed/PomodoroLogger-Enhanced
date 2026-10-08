/**
 * Keyboard predicates that need one wording across layers.
 *
 * `isEditableTarget` lived in the renderer's `Hotkeys` wrapper until the
 * shared `Search` bar (src/components/common, rendered by the Kanban page)
 * needed the same notion of "the user is typing" for its Ctrl+F listener.
 * Two copies of the predicate would eventually disagree about what typing
 * means and hand a keystroke to one side only, so it lives here, where both
 * the renderer and the common components can import it.
 */

/**
 * Is the event targeted at something the user types into?
 *
 * Consumers: the renderer's hotkey filter and `Timer.handleNativeKeydown`
 * (see src/renderer/components/Hotkeys.tsx -- they must agree so a binding
 * and Tab's preventDefault never come apart) and the Search bar's Ctrl+F
 * listener (which must not steal focus from a field being typed in). Same
 * predicate as react-hot-keys' stock `defaultFilter`: `document` and plain
 * elements pass, editable ones do not.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!target) {
        return false;
    }

    const element = target as { tagName?: string; isContentEditable?: boolean };
    return (
        element.isContentEditable === true ||
        element.tagName === 'INPUT' ||
        element.tagName === 'SELECT' ||
        element.tagName === 'TEXTAREA'
    );
}
