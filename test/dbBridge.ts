/**
 * Jest stand-in for the preload database bridge.
 *
 * Production `renderer/dbs.ts` always talks to `window.api`; there is no
 * renderer-side `require('../main/db')` branch left. Tests still want the real
 * in-memory repositories, so this setup installs a small bridge backed by the
 * same main-process module. Individual tests may replace `window.api` with
 * their own mock after this file has run.
 */
import { DBs, loadDBs } from '../src/main/db';
import { deleteKanbanItems } from '../src/main/db/kanbanDeletion';
import { moveCardInBoard } from '../src/main/db/cardDrag';
import { applySessionEdits, listUnassignedSessions } from '../src/main/db/sessionEdits';
import type { DeleteKanbanItemsPayload } from '../src/shared/kanbanDeletion';
import type { SessionEdit, UnassignedSessionsQuery } from '../src/shared/sessionEdits';
import type { DbName } from '../src/main/db/types';

const api = (window as any).api ?? {};

api.dbReady = async () => {
    await loadDBs();
};

api.dbRequest = async (name: DbName, operation: string, args: unknown[] = []) => {
    await loadDBs();
    const repository = (DBs as any)[name];
    if (!repository) {
        throw new Error(`Unknown database: ${name}`);
    }
    if (typeof repository[operation] !== 'function') {
        throw new Error(`Unknown database operation: ${name}.${operation}`);
    }
    return repository[operation](...args);
};

/**
 * The cascade delete now lives in the main process. Tests exercise the real
 * implementation against the in-memory database instead of stubbing it, so
 * the expand/remove/recalculate path is covered by the renderer action tests.
 */
api.deleteKanbanItems = (payload: DeleteKanbanItemsPayload) => deleteKanbanItems(payload);

/**
 * Same reasoning as the cascade delete: the editor's transaction and the
 * unassigned query are main-process code, exercised against the real
 * in-memory database rather than restated by a stub.
 */
api.applySessionEdits = (edits: SessionEdit[]) => applySessionEdits(edits);
api.listUnassignedSessions = (query: UnassignedSessionsQuery) => listUnassignedSessions(query);

/**
 * Dragging now writes through one transaction in the main process. Point the
 * bridge at the real implementation so the list action tests keep verifying the
 * database, not a restatement of the algorithm.
 */
api.moveCardInBoard = (payload: any) => moveCardInBoard(payload);

(window as any).api = api;
