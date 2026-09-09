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
            relatedSessions: [],
            spentHours: 0,
            lastVisitTime: 2000,
        },
    },
    cards: {
        card_a: {
            _id: 'card_a',
            content: 'card',
            sessionIds: [],
            spentTimeInHour: {
                actual: 0,
                estimated: 0,
            },
            title: 'card',
            // b.labels overwrites a.labels (last-write-wins on the whole array)
            labels: [{ name: 'shared', color: '#eb5a46' }],
        },
        card_b: {
            _id: 'card_b',
            content: 'cardB',
            sessionIds: [],
            spentTimeInHour: {
                actual: 0,
                estimated: 0,
            },
            title: 'card_b',
            // a card without labels gains labels from b
            labels: [{ name: 'new', color: '#0079bf' }],
        },
    },
    lists: {
        done: {
            _id: 'done',
            cards: ['card_a', 'card_b'],
            title: 'done',
        },
        focused: {
            _id: 'focused',
            cards: [],
            title: 'focused',
        },
    },
    move: [],
    records: [],
};
