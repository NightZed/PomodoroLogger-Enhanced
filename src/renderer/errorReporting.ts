import type { RendererErrorPayload } from '../main/ipc/type';

/**
 * The renderer's single entry point for reporting an error to the main
 * process, where it is appended to `crash.log`.
 *
 * Reporting is best effort by design: it must never throw, never block
 * rendering and never be the reason a crash is worse than it already is. The
 * same fingerprint twice within `DEDUPE_MS` is dropped, because one React
 * crash usually fires `componentDidCatch` and a `window 'error'` event for the
 * same failure.
 */

const DEDUPE_MS = 2000;
const MAX_MESSAGE = 4096;
const MAX_STACK = 32 * 1024;

const recent = new Map<string, number>();

function messageOf(error: unknown): string {
    if (error instanceof Error) {
        return error.message || error.name;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function stackOf(error: unknown): string | undefined {
    if (error instanceof Error && error.stack) {
        return error.stack;
    }
    return undefined;
}

export interface ReportExtra {
    /** Area the error came from, e.g. `timer`. */
    scope?: string;
    componentStack?: string | null;
}

export function reportRendererError(
    kind: RendererErrorPayload['kind'],
    error: unknown,
    extra: ReportExtra = {}
): void {
    try {
        const message = messageOf(error).slice(0, MAX_MESSAGE);
        const fingerprint = `${kind}|${message}`;
        const now = Date.now();
        const last = recent.get(fingerprint);
        if (last !== undefined && now - last < DEDUPE_MS) {
            return;
        }
        if (recent.size > 50) {
            recent.clear();
        }
        recent.set(fingerprint, now);

        const payload: RendererErrorPayload = {
            kind,
            message,
            timestamp: new Date().toISOString(),
            href: typeof location === 'undefined' ? '' : location.href,
        };

        if (extra.scope) {
            payload.scope = extra.scope;
        }
        const stack = stackOf(error);
        if (stack) {
            payload.stack = stack.slice(0, MAX_STACK);
        }
        if (extra.componentStack) {
            payload.componentStack = extra.componentStack.slice(0, MAX_STACK);
        }

        window.api?.reportError?.(payload);
    } catch {
        // Reporting itself must never raise.
    }
}
