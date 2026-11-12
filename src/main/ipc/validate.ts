import type { RendererErrorPayload, TrayIconPayload, TrayMenuItem } from './type';
import type { DeleteKanbanItemsPayload } from '../../shared/kanbanDeletion';
import type { MoveCardPayload } from '../../shared/cardMove';
import type { MoveCardInBoardPayload } from '../../shared/cardDrag';
import type { FinishedSessionPayload } from '../../shared/finishedSession';
import type { DataRepairPayload } from '../../shared/dataRepair';
import type { SessionEdit, UnassignedSessionsQuery } from '../../shared/sessionEdits';

/**
 * Small runtime validators for the preload boundary. TypeScript disappears at
 * runtime, and a compromised renderer can call any exposed method with any
 * payload, so every argument is checked before it reaches a main-process API.
 */

export type Validator = (value: unknown, index: number) => void;

export function assertString(value: unknown, name: string, maxLength = 2048): string {
    if (typeof value !== 'string' || value.length > maxLength) {
        throw new TypeError(`${name} must be a string of at most ${maxLength} characters`);
    }
    return value;
}

export function assertBoolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') {
        throw new TypeError(`${name} must be a boolean`);
    }
    return value;
}

export function assertOptionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    return assertBoolean(value, name);
}

export function assertOneOf<T extends string>(
    value: unknown,
    name: string,
    allowed: readonly T[]
): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
    }
    return value as T;
}

export function assertArray(value: unknown, name: string, maxLength: number): unknown[] {
    if (!Array.isArray(value) || value.length > maxLength) {
        throw new TypeError(`${name} must be an array of at most ${maxLength} entries`);
    }
    return value;
}

export function assertPlainObject(value: unknown, name: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${name} must be a plain object`);
    }
    return value as Record<string, unknown>;
}

/** Upper bound for one cascade request; a bigger delete is a bug, not a use case. */
const MAX_DELETED_IDS = 500;

export function assertDeleteKanbanItemsPayload(value: unknown): DeleteKanbanItemsPayload {
    const payload = assertPlainObject(value, 'deleteKanbanItems payload');
    const readIds = (field: 'cards' | 'lists' | 'boards'): string[] | undefined => {
        const raw = payload[field];
        if (raw === undefined) {
            return undefined;
        }
        const ids = assertArray(raw, `deleteKanbanItems.${field}`, MAX_DELETED_IDS);
        for (const [index, id] of ids.entries()) {
            assertString(id, `deleteKanbanItems.${field}[${index}]`, 200);
        }
        return ids as string[];
    };

    const cards = readIds('cards');
    const lists = readIds('lists');
    const boards = readIds('boards');
    if (cards === undefined && lists === undefined && boards === undefined) {
        throw new TypeError('deleteKanbanItems needs at least one of cards/lists/boards');
    }
    return { cards, lists, boards };
}

/** Upper bound for one session-edit batch; the editor pages anyway. */
const MAX_SESSION_EDITS = 500;

/**
 * `null` is a real value here (detach), so it is checked separately from
 * `undefined` (leave alone) instead of collapsing into "optional".
 */
const readOptionalId = (value: unknown, name: string): string | null | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return assertString(value, name, 200);
};

export function assertSessionEdits(value: unknown): SessionEdit[] {
    const entries = assertArray(value, 'applySessionEdits', MAX_SESSION_EDITS);
    const seen = new Set<string>();
    const edits: SessionEdit[] = [];

    for (const [index, entry] of entries.entries()) {
        const item = assertPlainObject(entry, `applySessionEdits[${index}]`);
        const _id = assertString(item._id, `applySessionEdits[${index}]._id`, 200);
        if (seen.has(_id)) {
            throw new TypeError(`applySessionEdits repeats session ${_id}`);
        }
        seen.add(_id);

        const isDelete =
            item.delete === undefined
                ? false
                : assertBoolean(item.delete, `applySessionEdits[${index}].delete`);
        const boardId = readOptionalId(item.boardId, `applySessionEdits[${index}].boardId`);
        const cardId = readOptionalId(item.cardId, `applySessionEdits[${index}].cardId`);

        if (!isDelete && boardId === undefined && cardId === undefined) {
            throw new TypeError(`applySessionEdits[${index}] has nothing to change`);
        }
        edits.push({ _id, delete: isDelete, boardId, cardId });
    }

    return edits;
}

export function assertMoveCardPayload(value: unknown): MoveCardPayload {
    const payload = assertPlainObject(value, 'moveCardToBoard payload');
    return {
        cardId: assertString(payload.cardId, 'moveCardToBoard.cardId', 200),
        targetListId: assertString(payload.targetListId, 'moveCardToBoard.targetListId', 200),
    };
}

export function assertMoveCardInBoardPayload(value: unknown): MoveCardInBoardPayload {
    const payload = assertPlainObject(value, 'moveCardInBoard payload');
    if (
        typeof payload.toIndex !== 'number' ||
        !Number.isFinite(payload.toIndex) ||
        payload.toIndex < 0
    ) {
        throw new TypeError('moveCardInBoard.toIndex must be a non-negative number');
    }
    return {
        cardId: assertString(payload.cardId, 'moveCardInBoard.cardId', 200),
        fromListId: assertString(payload.fromListId, 'moveCardInBoard.fromListId', 200),
        toListId: assertString(payload.toListId, 'moveCardInBoard.toListId', 200),
        toIndex: Math.trunc(payload.toIndex),
    };
}

/** Upper bound for one data-repair request; a bigger batch is a bug. */
const MAX_REPAIR_IDS = 2000;

const readIdList = (value: unknown, name: string): string[] => {
    const ids = assertArray(value, name, MAX_REPAIR_IDS);
    return ids.map((id, index) => assertString(id, `${name}[${index}]`, 200));
};

export function assertDataRepairPayload(value: unknown): DataRepairPayload {
    const payload = assertPlainObject(value, 'repairData payload');
    return {
        cardIds: readIdList(payload.cardIds, 'repairData.cardIds'),
        listIds: readIdList(payload.listIds, 'repairData.listIds'),
        removeOrphanMoves: assertBoolean(payload.removeOrphanMoves, 'repairData.removeOrphanMoves'),
        listCardRefIds: readIdList(payload.listCardRefIds, 'repairData.listCardRefIds'),
        boardListRefIds: readIdList(payload.boardListRefIds, 'repairData.boardListRefIds'),
        cardSessionRefIds: readIdList(payload.cardSessionRefIds, 'repairData.cardSessionRefIds'),
    };
}

export function assertUnassignedSessionsQuery(value: unknown): UnassignedSessionsQuery {
    if (value === undefined || value === null) {
        return {};
    }

    const query = assertPlainObject(value, 'listUnassignedSessions query');
    const boardId =
        query.boardId === undefined
            ? undefined
            : assertString(query.boardId, 'listUnassignedSessions.boardId', 200);

    let limit: number | undefined;
    if (query.limit !== undefined) {
        if (typeof query.limit !== 'number' || !Number.isFinite(query.limit) || query.limit < 1) {
            throw new TypeError('listUnassignedSessions.limit must be a positive number');
        }
        limit = Math.trunc(query.limit);
    }

    return { boardId, limit };
}

/**
 * A finished pomodoro carries the whole activity breakdown, so only the fields
 * the write path derives numbers from are checked. Everything else is opaque
 * JSON the history page reads back verbatim; rejecting it here would mean
 * duplicating the import validator without any of its context.
 */
export function assertFinishedSessionPayload(value: unknown): FinishedSessionPayload {
    const payload = assertPlainObject(value, 'recordFinishedSession payload');
    const session = assertPlainObject(payload.session, 'recordFinishedSession.session');

    const _id = assertString(session._id, 'recordFinishedSession.session._id', 200);
    if (_id.length === 0) {
        throw new TypeError('recordFinishedSession.session._id must not be empty');
    }

    if (
        typeof session.startTime !== 'number' ||
        !Number.isFinite(session.startTime) ||
        session.startTime <= 0
    ) {
        throw new TypeError('recordFinishedSession.session.startTime must be a positive number');
    }

    if (
        typeof session.spentTimeInHour !== 'number' ||
        !Number.isFinite(session.spentTimeInHour) ||
        session.spentTimeInHour < 0
    ) {
        throw new TypeError(
            'recordFinishedSession.session.spentTimeInHour must be a non-negative number'
        );
    }

    if (session.boardId !== undefined) {
        assertString(session.boardId, 'recordFinishedSession.session.boardId', 200);
    }
    if (session.apps !== undefined) {
        assertPlainObject(session.apps, 'recordFinishedSession.session.apps');
    }

    const cardId =
        payload.cardId === undefined
            ? undefined
            : assertString(payload.cardId, 'recordFinishedSession.cardId', 200);

    return {
        session: session as unknown as FinishedSessionPayload['session'],
        cardId,
    };
}

export function assertTrayMenuItems(value: unknown): TrayMenuItem[] {
    const items = assertArray(value, 'tray menu items', 10);
    for (const [index, item] of items.entries()) {
        const entry = assertPlainObject(item, `tray menu item ${index}`);
        assertString(entry.key, `tray menu item ${index}.key`, 100);
        assertString(entry.label, `tray menu item ${index}.label`, 200);
        assertBoolean(entry.enabled, `tray menu item ${index}.enabled`);
    }
    return items as TrayMenuItem[];
}

export function assertTrayIconPayload(value: unknown): TrayIconPayload {
    const payload = assertPlainObject(value, 'tray icon');
    assertString(payload.src, 'tray icon.src', 5 * 1024 * 1024);
    if (typeof payload.scaleFactor !== 'number' || !Number.isFinite(payload.scaleFactor)) {
        throw new TypeError('tray icon.scaleFactor must be a finite number');
    }
    return payload as unknown as TrayIconPayload;
}

export function assertScreenshotDataUrl(value: unknown): string {
    const dataUrl = assertString(value, 'screenshot data URL', 20 * 1024 * 1024);
    if (!dataUrl.startsWith('data:image/')) {
        throw new TypeError('screenshot data URL must start with data:image/');
    }
    return dataUrl;
}

export function assertScreenshotPaths(value: unknown): string[] {
    const paths = assertArray(value, 'screenshot paths', 1000);
    for (const path of paths) {
        assertString(path, 'screenshot path', 1024);
    }
    return paths as string[];
}

const ERROR_KINDS = ['react', 'window-error', 'unhandledrejection', 'component'] as const;

/**
 * Validates a crash report from the renderer. Everything here can be attacker
 * controlled (a compromised renderer calls `window.api.reportError` with any
 * payload), and the payload is written straight to disk, so unknown fields are
 * dropped and every string is capped.
 */
export function assertRendererErrorPayload(value: unknown): RendererErrorPayload {
    const payload = assertPlainObject(value, 'error report');
    const kind = assertOneOf(payload.kind, 'error report.kind', ERROR_KINDS);
    const message = assertString(payload.message, 'error report.message', 4096);

    const result: RendererErrorPayload = {
        kind,
        message,
        timestamp: assertString(payload.timestamp, 'error report.timestamp', 64),
        href: assertString(payload.href, 'error report.href', 2048),
    };

    if (payload.scope !== undefined) {
        result.scope = assertString(payload.scope, 'error report.scope', 64);
    }
    if (payload.stack !== undefined) {
        result.stack = assertString(payload.stack, 'error report.stack', 32 * 1024);
    }
    if (payload.componentStack !== undefined) {
        result.componentStack = assertString(
            payload.componentStack,
            'error report.componentStack',
            16 * 1024
        );
    }
    if (payload.tab !== undefined) {
        result.tab = assertString(payload.tab, 'error report.tab', 64);
    }

    return result;
}

export function assertOpenExternalUrl(value: unknown): string {
    const raw = assertString(value, 'external URL', 2048);
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new TypeError('external URL is malformed');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TypeError('external URL must use http: or https:');
    }
    return url.toString();
}
