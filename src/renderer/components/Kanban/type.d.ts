import type { DistractingRow } from '../Timer/action';

export interface CardLabel {
    name: string;
    color: string;
}

export interface Card {
    _id: string;
    content: string;
    title: string;
    sessionIds: string[];
    labels?: CardLabel[];
    spentTimeInHour: {
        estimated: number;
        actual: number;
    };
    createdTime?: number;
    // last time the card was moved into the board's done list; kept after the
    // card is dragged out again so it can still show "Last completed"
    completedTime?: number;
}

export interface AggInfo {
    lastUpdatedTime: number;
    spentTime: number;
    appSpentTime: { [app: string]: number };
    keywordWeights: { [key: string]: number };
}

export interface Tag {
    name: string;
    count: number;
}

/**
 * How much of a card the board shows:
 * - `title`: title and metadata only (the old "collapse view");
 * - `preview`: title, metadata and a height-limited, scrollable body;
 * - `full`: title, metadata and the whole body, no inner scrollbar.
 *
 * This is a per-board display preference, so it is stored on the board and
 * never inherited by the Timer sider's focused-list preview (which always uses
 * `full`).
 */
export type CardView = 'title' | 'preview' | 'full';

export interface KanbanBoard {
    _id: string;
    name: string;
    spentHours: number;
    description: string;
    lists: string[]; // lists id in order
    focusedList: string;
    doneList: string;
    relatedSessions: string[];
    dueTime?: number; // TODO: Add due time setting
    lastVisitTime?: number;
    createdTime?: number;
    aggInfo?: AggInfo;
    pin?: boolean;
    cardView?: CardView;
    distractionList?: DistractingRow[];
}

export interface List {
    _id: string;
    title: string;
    cards: string[]; // lists id in order
    visibleCards?: string[];
}

export type ListsState = { [_id: string]: List };

export interface MoveInfo {
    fromListId: string;
    toListId: string;
    cardId: string;
    time: number;
}
