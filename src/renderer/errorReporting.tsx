import * as React from 'react';
import { Button } from 'antd';
import { feedback } from './components/feedback';
import { t } from './i18n';
import type { RendererDataFailurePayload, RendererErrorPayload } from '../main/ipc/type';

/**
 * The renderer's single entry point for reporting an error to the main
 * process.
 *
 * Two destinations:
 *
 * - `reportRendererError` appends to `crash.log` -- the window broke or a
 *   component threw;
 * - `reportDataFailure` appends to `data.log` -- a write or read lost data
 *   (a finished pomodoro, a card move) while the window kept working. Its line
 *   carries the ids the user could otherwise not reconstruct.
 *
 * Reporting is best effort by design: it must never throw, never block
 * rendering and never be the reason a crash is worse than it already is.
 *
 * One fingerprint (`kind|message`) is the unit of both the log and the UI:
 *
 * - the first occurrence is written immediately; while it keeps happening,
 *   further lines wait for `AGGREGATE_MS`, and each line carries the running
 *   count (`(x37)`). A pointer-driven burst -- the sankey tooltip used to
 *   throw on every mousemove -- therefore leaves one line a minute instead of
 *   one per event;
 * - `ReportExtra.notify` asks for the one-time error notice. Callers whose
 *   failure leaves the window usable (uncaught errors, rejected promises, the
 *   Timer page's inner boundary) set it; a React render failure replaces the
 *   whole window with `ErrorScreen` and must not also raise a notice.
 */

/** How long a fingerprint stays out of the log after a written line. */
const AGGREGATE_MS = 60 * 1000;
/** Distinct fingerprints tracked at once; beyond this the oldest is dropped. */
const MAX_FINGERPRINTS = 50;
const MAX_MESSAGE = 4096;
const MAX_STACK = 32 * 1024;
/** Longest context line; matches the cap in `assertRendererDataFailurePayload`. */
const MAX_CONTEXT = 1024;
/** Longest error text the notice shows; `crash.log` keeps the whole message. */
const MAX_NOTICE_TEXT = 300;

interface FingerprintRecord {
    /** Occurrences since the app started, including the ones not written. */
    count: number;
    /** When a line was last written, or 0 before the first one. */
    lastWritten: number;
    /** The one-time notice has been shown for this fingerprint. */
    notified: boolean;
}

const recent = new Map<string, FingerprintRecord>();

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

/**
 * Counts one occurrence and returns the record.
 *
 * Insertion order is the eviction order: a fingerprint that has not been seen
 * since the map last overflowed is not worth keeping, and dropping it only
 * means its next occurrence starts a new line/notice.
 */
function countOccurrence(fingerprint: string): FingerprintRecord {
    const existing = recent.get(fingerprint);
    if (existing) {
        existing.count += 1;
        return existing;
    }

    if (recent.size >= MAX_FINGERPRINTS) {
        const oldest = recent.keys().next();
        if (!oldest.done) {
            recent.delete(oldest.value);
        }
    }

    const record: FingerprintRecord = { count: 1, lastWritten: 0, notified: false };
    recent.set(fingerprint, record);
    return record;
}

const logFolderButton = () => (
    <Button size="small" onClick={() => window.api?.openLogDir?.()}>
        {t('crash.logFolder')}
    </Button>
);

/**
 * The one-time notice of a still-usable window.
 *
 * Returns false when the feedback bridge is not mounted yet (the antd `App`
 * lives inside `<Application />`, so an error during startup has none): the
 * caller then leaves the fingerprint un-notified, and a later occurrence still
 * gets its notice.
 */
function showNotice(
    fingerprint: string,
    title: React.ReactNode,
    description: React.ReactNode
): boolean {
    try {
        feedback.notice({
            // One slot per fingerprint: a repeat updates the same notice
            // instead of stacking another.
            key: `renderer-error:${fingerprint}`,
            kind: 'error',
            title,
            description,
            actions: logFolderButton(),
        });
        return true;
    } catch {
        return false;
    }
}

export interface ReportExtra {
    /** Area the error came from, e.g. `timer`. */
    scope?: string;
    componentStack?: string | null;
    /** Show the one-time error notice, see the module comment. */
    notify?: boolean;
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
        const record = countOccurrence(fingerprint);

        if (extra.notify === true && !record.notified) {
            record.notified = showNotice(
                fingerprint,
                t('crash.noticeTitle'),
                <div>
                    <div style={{ wordBreak: 'break-word' }}>
                        {message.length > MAX_NOTICE_TEXT
                            ? `${message.slice(0, MAX_NOTICE_TEXT)}…`
                            : message}
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--pl-text-tertiary)' }}>
                        {t('crash.noticeHint')}
                    </div>
                </div>
            );
        }

        if (record.lastWritten !== 0 && now - record.lastWritten < AGGREGATE_MS) {
            return;
        }
        record.lastWritten = now;

        const payload: RendererErrorPayload = {
            kind,
            message,
            timestamp: new Date().toISOString(),
            href: typeof location === 'undefined' ? '' : location.href,
            count: record.count,
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

/** Context values are printed as `key=value`; `undefined` entries are skipped. */
export type DataFailureContext = Record<string, string | number | boolean | undefined>;

function formatContext(context: DataFailureContext): string | undefined {
    const parts = Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`);
    if (parts.length === 0) {
        return undefined;
    }

    const text = parts.join(' ');
    return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}…` : text;
}

/**
 * Reports a failure that lost data the user expects to keep -- typically a
 * finished session the main process never received.
 *
 * The line lands in `data.log`, not `crash.log`: nothing broke, but a record
 * is missing and the ids in `context` are what makes the loss diagnosable.
 * Repeats share the crash reporter's aggregation, so a disk that keeps failing
 * leaves one line a minute instead of one per pomodoro.
 */
export interface DataFailureExtra {
    /**
     * Show the persistent error notice once per fingerprint. Errors use
     * `notice` rather than `toast` (see the feedback module): the data is
     * already gone, and a two-second receipt is missed whenever the window is
     * mini/tray or the user is away.
     */
    notify?: boolean;
    /**
     * What was lost, in the user's terms (`timer.saveFailed`); the raw error
     * text stays in the log. Falls back to the notice's generic body.
     */
    description?: React.ReactNode;
}

export function reportDataFailure(
    scope: string,
    error: unknown,
    context: DataFailureContext = {},
    extra: DataFailureExtra = {}
): void {
    try {
        const message = messageOf(error).slice(0, MAX_MESSAGE);
        const fingerprint = `data|${scope}|${message}`;
        const now = Date.now();
        const record = countOccurrence(fingerprint);

        if (extra.notify === true && !record.notified) {
            record.notified = showNotice(
                fingerprint,
                t('common.dataNotSaved'),
                <div>
                    {extra.description === undefined ? undefined : (
                        <div style={{ wordBreak: 'break-word' }}>{extra.description}</div>
                    )}
                    <div style={{ marginTop: 4, color: 'var(--pl-text-tertiary)' }}>
                        {t('common.dataNotSavedHint')}
                    </div>
                </div>
            );
        }

        if (record.lastWritten !== 0 && now - record.lastWritten < AGGREGATE_MS) {
            return;
        }
        record.lastWritten = now;

        const payload: RendererDataFailurePayload = {
            scope,
            message,
            timestamp: new Date().toISOString(),
            count: record.count,
        };
        const stack = stackOf(error);
        if (stack) {
            payload.stack = stack.slice(0, MAX_STACK);
        }
        const contextText = formatContext(context);
        if (contextText) {
            payload.context = contextText;
        }

        window.api?.reportDataFailure?.(payload);
    } catch {
        // Reporting itself must never raise.
    }
}
