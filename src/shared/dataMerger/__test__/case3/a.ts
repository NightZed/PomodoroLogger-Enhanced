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
            lastVisitTime: 1000,
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
            labels: [
                { name: 'old', color: '#61bd4f' },
                { name: 'shared', color: '#f2d600' },
            ],
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
