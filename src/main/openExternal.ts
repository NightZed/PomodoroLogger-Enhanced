import { shell } from 'electron';

/**
 * Hands a user-visible link to the operating system, but only for web URLs.
 * Both the explicit `window.api.openExternal` path and Electron's
 * `will-navigate` / `setWindowOpenHandler` hooks go through here, so a renderer
 * cannot turn a link into `file:`, `javascript:` or an app-specific protocol.
 */
export function openExternalUrl(raw: string): void {
    let url: URL;
    try {
        url = new URL(raw);
    } catch (e) {
        console.warn('[shell] refusing to open a malformed URL:', raw);
        return;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        console.warn('[shell] refusing to open a non-web URL:', raw);
        return;
    }

    void shell.openExternal(url.toString());
}
