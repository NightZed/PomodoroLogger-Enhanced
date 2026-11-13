import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { List } from './List';
import { feedback } from '../../feedback';

jest.mock('@hello-pangea/dnd', () => ({
    Draggable: (props: any) =>
        props.children(
            { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false }
        ),
    Droppable: (props: any) =>
        props.children(
            {
                innerRef: () => undefined,
                // `data-pl-scroller` gives the tests a stable handle on the
                // scroll container (`Cards`), whose class name is generated.
                droppableProps: { 'data-pl-scroller': 'true' },
                placeholder: null,
            },
            { isDraggingOver: false }
        ),
}));
jest.mock('../../Visualization/Timeline', () => ({
    formatTimeYmdHm: (time: number) => `time-${time}`,
}));
jest.mock('../../feedback', () => ({
    ...jest.requireActual('../../feedback'),
    feedback: { toast: jest.fn(), confirm: jest.fn() },
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
            cardView: 'preview',
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

    it('preview ignores the board search and never writes visibleCards', () => {
        const { ids, cards } = makeCards(3);
        const setVisibleCards = jest.fn();
        const props: any = {
            _id: 'list-1',
            listId: 'list-1',
            index: 0,
            boardId: 'board-1',
            title: 'List',
            cards: ids,
            cardsState: cards,
            cardView: 'full',
            preview: true,
            searchReg: 'Card 1',
            setVisibleCards,
            setEditCard: noop,
            setSearchReg: noop,
            setContent: noop,
            deleteList: noop,
            renameList: noop,
            addCard: noop,
        };

        const { container } = render(<List {...props} />);

        // All cards, even though the board search only matches one of them.
        expect(container.querySelectorAll('.kanban-card-preview')).toHaveLength(3);
        expect(container.querySelectorAll('.kanban-card')).toHaveLength(0);
        // The preview is not allowed to touch the board's filter state.
        expect(setVisibleCards).not.toHaveBeenCalled();
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
                cardView: 'preview',
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

describe('List delete menu', () => {
    afterEach(() => {
        cleanup();
        jest.clearAllMocks();
    });

    it('confirms through the shared modal, not a popover inside the closing menu', async () => {
        // The delete item used to carry a `Popconfirm` as its label. The click
        // that opened it also closed the Dropdown, so the popup (whose trigger
        // was being hidden at the same time) only appeared intermittently.
        // The item now opens the shared modal confirm, which the menu closing
        // cannot touch.
        const { ids, cards } = makeCards(2);
        const deleteList = jest.fn();
        render(
            <List
                {...({
                    _id: 'list-1',
                    listId: 'list-1',
                    index: 0,
                    boardId: 'board-1',
                    title: 'List',
                    cards: ids,
                    cardsState: cards,
                    cardView: 'preview',
                    setVisibleCards: noop,
                    setEditCard: noop,
                    setSearchReg: noop,
                    setContent: noop,
                    deleteList,
                    renameList: noop,
                    addCard: noop,
                } as any)}
            />
        );

        await act(async () => {
            fireEvent.click(screen.getByLabelText('List actions'));
        });

        await act(async () => {
            fireEvent.click(screen.getByText('Delete'));
        });

        expect(feedback.confirm).toHaveBeenCalledTimes(1);
        expect(feedback.confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }));
        // Nothing is removed until the dialog is accepted.
        expect(deleteList).not.toHaveBeenCalled();

        const { onOk } = (feedback.confirm as jest.Mock).mock.calls[0][0];
        await act(async () => {
            onOk();
        });
        expect(deleteList).toHaveBeenCalledWith('list-1', 'board-1');
    });
});

describe('List scroll state', () => {
    afterEach(() => {
        cleanup();
        jest.useRealTimers();
    });

    const renderList = () => {
        const { ids, cards } = makeCards(3);
        const props: any = {
            _id: 'list-1',
            listId: 'list-1',
            index: 0,
            boardId: 'board-1',
            title: 'List',
            cards: ids,
            cardsState: cards,
            cardView: 'full',
            setVisibleCards: noop,
            setEditCard: noop,
            setSearchReg: noop,
            setContent: noop,
            deleteList: noop,
            renameList: noop,
            addCard: noop,
        };
        return render(<List {...props} />);
    };

    it('marks the scroller while it scrolls and clears it after the gesture', () => {
        jest.useFakeTimers();
        const { container } = renderList();
        const scroller = container.querySelector('[data-pl-scroller]') as HTMLElement;
        // Visible for a moment after the list mounts, as before.
        expect(scroller.classList.contains('pl-list-scrolling')).toBe(true);

        act(() => {
            jest.advanceTimersByTime(700);
        });
        expect(scroller.classList.contains('pl-list-scrolling')).toBe(false);

        // The class is written directly on the node -- no React state, so no
        // re-render of the list (or of any card) is needed while scrolling.
        fireEvent.scroll(scroller);
        expect(scroller.classList.contains('pl-list-scrolling')).toBe(true);

        act(() => {
            jest.advanceTimersByTime(700);
        });
        expect(scroller.classList.contains('pl-list-scrolling')).toBe(false);
    });
});
