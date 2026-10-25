import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { List } from './List';

jest.mock('@hello-pangea/dnd', () => ({
    Draggable: (props: any) =>
        props.children(
            { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false }
        ),
    Droppable: (props: any) =>
        props.children(
            { innerRef: () => undefined, droppableProps: {}, placeholder: null },
            { isDraggingOver: false }
        ),
}));
jest.mock('../../Visualization/Timeline', () => ({
    formatTimeYmdHm: (time: number) => `time-${time}`,
}));
jest.mock('../../feedback', () => ({
    ...jest.requireActual('../../feedback'),
    feedback: { toast: jest.fn() },
}));

const makeCards = (count: number) => {
    const ids: string[] = [];
    const cards: any = {};
    for (let index = 0; index < count; index += 1) {
        const id = `card-${index}`;
        ids.push(id);
        cards[id] = {
            _id: id,
            title: `Card ${index}`,
            content: `content ${index}`,
            sessionIds: [],
            spentTimeInHour: { estimated: 1, actual: 0.5 },
            createdTime: 1600000000000,
        };
    }
    return { ids, cards };
};

// Deliberately loose: `setEditCard` / `setSearchReg` are deox action creators
// with a `.type` property in their real type, which a plain jest.fn() lacks.
// This test only needs the callbacks to exist.
const noop: any = jest.fn();

describe('List progressive card mounting', () => {
    afterEach(() => {
        cleanup();
    });

    it('mounts only the first page synchronously', () => {
        const { ids, cards } = makeCards(20);
        // The unconnected component is normally fed by connect(); this test
        // only needs the subset of action props List actually calls.
        const props: any = {
            _id: 'list-1',
            listId: 'list-1',
            index: 0,
            boardId: 'board-1',
            title: 'List',
            cards: ids,
            cardsState: cards,
            collapsed: false,
            searchReg: undefined,
            setVisibleCards: noop,
            setEditCard: noop,
            setSearchReg: noop,
            setContent: noop,
            deleteList: noop,
            renameList: noop,
            addCard: noop,
        };
        const { container } = render(<List {...props} />);

        // 6 cards for the first frame, not all 20.
        expect(container.querySelectorAll('.kanban-card')).toHaveLength(6);
    });

    it('settles when one list is mounted twice (board + Timer preview)', () => {
        // The board renders the focused list and the Timer sider renders the
        // same list as a preview (the Timer page stays mounted, see
        // `APP_TABS.forceRender`). Both filter into their own array, so the
        // shared `visibleCards` store value used to be written back and forth
        // forever while searching, which React reported as "Maximum update
        // depth exceeded". The sync compares contents now, so it must settle
        // after at most one write per instance.
        const { ids, cards } = makeCards(3);
        let writes = 0;
        let lastValue: string[] | undefined;

        const Harness = ({ searchReg }: { searchReg?: string }) => {
            const [stored, setStored] = React.useState<string[] | undefined>(undefined);
            const setVisibleCards = React.useCallback((_id: string, value?: string[]) => {
                writes += 1;
                lastValue = value;
                setStored(value);
            }, []);

            const listProps: any = {
                _id: 'list-1',
                listId: 'list-1',
                index: 0,
                boardId: 'board-1',
                title: 'List',
                cards: ids,
                cardsState: cards,
                collapsed: false,
                searchReg,
                visibleCards: stored,
                setVisibleCards,
                setEditCard: noop,
                setSearchReg: noop,
                setContent: noop,
                deleteList: noop,
                renameList: noop,
                addCard: noop,
            };

            return (
                <>
                    <List key="board" {...listProps} />
                    <List key="timer-preview" {...listProps} />
                </>
            );
        };

        const { rerender } = render(<Harness />);
        expect(writes).toBe(0);

        rerender(<Harness searchReg="Card 1" />);

        expect(writes).toBeLessThanOrEqual(2);
        expect(lastValue).toEqual(['card-1']);
    });
});
