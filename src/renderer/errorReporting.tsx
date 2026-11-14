import * as React from 'react';
import { Button } from 'antd';
import { feedback } from './components/feedback';
import { t } from './i18n';
import type { RendererErrorPayload } from '../main/ipc/type';

/**
 * The renderer's single entry point for reporting an error to the main
 * process, where it is appended to `crash.log`.
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

/**
 * The one-time notice of a still-usable window.
 *
 * Returns false when the feedback bridge is not mounted yet (the antd `App`
 * lives inside `<Application />`, so an error during startup has none): the
 * caller then leaves the fingerprint un-notified, and a later occurrence still
 * gets its notice.
 */
function showNotice(fingerprint: string, message: string): boolean {
    try {
        feedback.notice({
            // One slot per fingerprint: a repeat updates the same notice
            // instead of stacking another.
            key: `renderer-error:${fingerprint}`,
            kind: 'error',
            title: t('crash.noticeTitle'),
            description: (
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
            ),
            actions: (
                <Button size="small" onClick={() => window.api?.openLogDir?.()}>
                    {t('crash.logFolder')}
                </Button>
            ),
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
            record.notified = showNotice(fingerprint, message);
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
