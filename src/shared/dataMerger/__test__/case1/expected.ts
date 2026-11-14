import { SourceData } from '../../dataMerger';

export const data: SourceData = {
    boards: {
        a: {
            _id: 'a',
            description: 'a',
            doneList: 'done',
            focusedList: 'focused',
            lists: ['done', 'focused'],
            name: 'a',
            relatedSessions: ['sess0', 'sess2', 'sess1'],
            // Three sessions at 10h each. The merged cards add up to 40h
            // because `sess0` is counted by two of them; the board total has
            // to come from the sessions, not from the cards.
            spentHours: 30,
        },
    },
    cards: {
        card_a: {
            _id: 'card_a',
            content: 'card',
            sessionIds: ['sess0', 'sess1'],
            spentTimeInHour: {
                actual: 20,
                estimated: 100,
            },
            title: 'card',
        },
        card_b: {
            _id: 'card_b',
            content: 'card',
            sessionIds: ['sess2'],
            spentTimeInHour: {
                actual: 10,
                estimated: 100,
            },
            title: 'card',
        },
        card_c: {
            _id: 'card_c',
            content: 'card',
            sessionIds: ['sess0'],
            spentTimeInHour: {
                actual: 10,
                estimated: 100,
            },
            title: 'card',
        },
    },
    lists: {
        done: {
            _id: 'done',
            cards: ['card_c'],
            title: 'done',
        },
        focused: {
            _id: 'focused',
            cards: ['card_a', 'card_b'],
            title: 'focused',
        },
    },
    move: [
        {
            cardId: 'card_a',
            fromListId: 'done',
            toListId: 'focused',
            time: 1,
        },
    ],
    records: [
        {
            _id: 'sess0',
            boardId: 'a',
            apps: {},
            spentTimeInHour: 10,
            startTime: 123000,
            switchTimes: 100,
        },
        {
            _id: 'sess2',
            boardId: 'a',
            apps: {},
            spentTimeInHour: 10,
            startTime: 124000,
            switchTimes: 100,
        },
        {
            _id: 'sess1',
            boardId: 'a',
            apps: {},
            spentTimeInHour: 10,
            startTime: 125000,
            switchTimes: 100,
        },
    ],
};
