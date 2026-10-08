/**
 * Locate a checkbox among all checkboxes of `container` in document order.
 * `formatMarkdown` renders the Nth `[ ]`/`[x]` of the markdown source as the
 * Nth checkbox input, so this index is what maps a clicked box back to its
 * source occurrence. Returns -1 when the checkbox is not inside the container.
 */
export function getCheckboxIndex(container: HTMLElement, checkbox: HTMLElement): number {
    const checkboxes = container.querySelectorAll('[type="checkbox"]');
    let index = 0;
    for (const x of Array.from(checkboxes)) {
        if (x === checkbox) {
            return index;
        }

        index += 1;
    }

    return -1;
}

/**
 * Flip the `index`-th (0-based) `[ ]` / `[x]` occurrence of the markdown
 * source: `[ ]` becomes `[x]` and vice versa. Returns the new content, or
 * undefined when `index` does not point at a checkbox occurrence.
 */
export function toggleNthCheckbox(content: string, index: number): string | undefined {
    if (index < 0) {
        return undefined;
    }

    const reg = /\[(x| )\]/g;
    let match: RegExpExecArray | null = null;
    for (let i = 0; i <= index; i += 1) {
        match = reg.exec(content);
        if (match === null) {
            return undefined;
        }
    }

    // `match` is non-null here: the loop either returns or assigns a match
    const m = match as RegExpExecArray;
    const char = m[1] === 'x' ? ' ' : 'x';
    return `${content.slice(0, m.index)}[${char}]${content.slice(m.index + 3)}`;
}
