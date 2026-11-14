import { existsSync, mkdirSync, writeFile } from 'fs';
import path from 'path';
import { dbBkBaseDir } from '../config';
import type { SourceData } from '../../shared/dataMerger/dataMerger';
import { DBs, loadDBs } from '../db';
import { SqliteRepository } from '../db/repository';
import { readAllData } from './read';
import { promisify } from 'util';

/**
 * Rows inserted per transaction.
 *
 * Every SQLite call here is synchronous, and a better-sqlite3 transaction
 * callback cannot yield: clearing five tables and reinserting them in one
 * transaction freezes the main process for seconds on a large import. ~250
 * rows cost one frame or less (see sessionHours' WRITE_BATCH), and committing
 * per batch means an interrupted import leaves partial data that a re-run
 * converges on (the merge is idempotent) -- the backup written just below
 * keeps the pre-import state safe meanwhile.
 */
const INSERT_BATCH = 250;

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function writeAllFile(data: SourceData, previous?: SourceData) {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
    // The backup must capture the pre-import state. The import handler has
    // just read it for the merge, so it passes the snapshot in; re-reading the
    // whole database here would parse every session doc a second time.
    await generateBackup(previous);

    const cards = DBs.cardsDB as SqliteRepository;
    const lists = DBs.listsDB as SqliteRepository;
    const boards = DBs.kanbanDB as SqliteRepository;
    const moves = DBs.moveDB as SqliteRepository;
    const sessions = DBs.sessionDB as unknown as SqliteRepository;

    await clearAndInsert(cards, Object.values(data.cards));
    await clearAndInsert(lists, Object.values(data.lists));
    await clearAndInsert(boards, Object.values(data.boards));
    await clearAndInsert(moves, data.move);
    await clearAndInsert(sessions, data.records);
}

async function clearAndInsert(repository: SqliteRepository, docs: any[]) {
    repository.clearSync();
    for (let start = 0; start < docs.length; start += INSERT_BATCH) {
        repository.insertSync(docs.slice(start, start + INSERT_BATCH));
        await yieldToEventLoop();
    }
}

export async function generateBackup(previous?: SourceData) {
    if (!existsSync(dbBkBaseDir)) {
        mkdirSync(dbBkBaseDir, { recursive: true });
    }

    const backup = previous ?? (await readAllData());
    await promisify(writeFile)(
        path.join(dbBkBaseDir, 'pomodoro-logger-data-backup.json'),
        JSON.stringify(backup),
        {
            encoding: 'utf-8',
        }
    );
}
