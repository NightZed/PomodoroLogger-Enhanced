import type { SourceData } from '../../shared/dataMerger/dataMerger';
import { DBs, loadDBs } from '../db';
import type { CardsState } from '../../renderer/components/Kanban/Card/action';
import type { ListsState, MoveInfo } from '../../renderer/components/Kanban/type';
import type { KanbanBoardState } from '../../renderer/components/Kanban/Board/action';
import type { PomodoroRecord } from '../../renderer/monitor/type';

export async function readAllData(): Promise<SourceData> {
    await loadDBs(['cardsDB', 'listsDB', 'kanbanDB', 'moveDB', 'sessionDB']);
    const cards: CardsState = await readKanban(DBs.cardsDB);
    const lists: ListsState = await readKanban(DBs.listsDB);
    const boards: KanbanBoardState = await readKanban(DBs.kanbanDB);
    const move: MoveInfo[] = await DBs.moveDB.find();
    const records: PomodoroRecord[] = await DBs.sessionDB.find();
    return {
        boards,
        cards,
        lists,
        move,
        records,
    };
}

async function readKanban(db: (typeof DBs)['cardsDB']) {
    const cards = await db.find();
    const cardMap: { [id: string]: any } = {};
    for (const card of cards) {
        cardMap[card._id] = card;
    }

    return cardMap;
}
