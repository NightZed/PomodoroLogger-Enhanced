/**
 * Copy text to the system clipboard.
 *
 * `navigator.clipboard` is the normal path; it rejects when the document is
 * not focused (a window that just handed focus to the browser, a `file://`
 * page), so fall back to the legacy textarea + execCommand route.
 *
 * Resolves to whether the text actually reached the clipboard: callers show
 * "Copied" only on `true`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // file:// pages without focus can reject; use the legacy path.
    }

    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
    } catch {
        return false;
    }
}
