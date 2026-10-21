import { existsSync, mkdirSync, writeFile } from 'fs';
import path from 'path';
import { dbBkBaseDir } from '../../config';
import type { SourceData } from '../../shared/dataMerger/dataMerger';
import { DBs, loadDBs, runInTransaction } from '../db';
import { SqliteRepository } from '../db/repository';
import { readAllData } from './read';
import { promisify } from 'util';

export async function writeAllFile(data: SourceData) {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
    // should use latest data
    await generateBackup();

    // The old NeDB code deleted table by table and inserted in parallel. On
    // SQLite this is one transaction: a failed import leaves the previous data
    // intact instead of a half-empty board/session set.
    runInTransaction(() => {
        const cards = DBs.cardsDB as SqliteRepository;
        const lists = DBs.listsDB as SqliteRepository;
        const boards = DBs.kanbanDB as SqliteRepository;
        const moves = DBs.moveDB as SqliteRepository;
        const sessions = DBs.sessionDB as unknown as SqliteRepository;

        for (const repository of [cards, lists, boards, moves, sessions]) {
            repository.clearSync();
        }

        cards.insertSync(Object.values(data.cards));
        lists.insertSync(Object.values(data.lists));
        boards.insertSync(Object.values(data.boards));
        moves.insertSync(data.move);
        sessions.insertSync(data.records);
    });
}

export async function generateBackup() {
    if (!existsSync(dbBkBaseDir)) {
        mkdirSync(dbBkBaseDir, { recursive: true });
    }

    const backup = await readAllData();
    await promisify(writeFile)(
        path.join(dbBkBaseDir, 'pomodoro-logger-data-backup.json'),
        JSON.stringify(backup),
        {
            encoding: 'utf-8',
        }
    );
}
