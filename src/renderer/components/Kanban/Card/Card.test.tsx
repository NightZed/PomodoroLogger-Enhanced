/**
 * Regression: clicking a link inside a card's markdown used to do BOTH things
 * at once -- the anchor's default action opened the URL in the external
 * browser (formatMarkdown adds target="_blank" -> main process
 * setWindowOpenHandler -> shell.openExternal), while the click also fell
 * through the card's onClick into `setEditCard`, popping the card editor on
 * top of the browser. The link branch in Card.tsx must swallow only the
 * editor navigation and must NOT preventDefault, so the browser keeps
 * opening the URL.
 *
 * The surrounding click behaviors (body -> editor, #tag -> search,
 * checkbox -> toggle) are asserted alongside as guards against the link
 * branch stealing one of them.
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';

// The drag-and-drop package is plumbing, not the subject: its Draggable only
// wraps the card in a drag context. Rendering the real one under jsdom drags
// in rAF/measurements for zero extra coverage of the click logic.
jest.mock('@hello-pangea/dnd', () => ({
    Draggable: (props: any) =>
        props.children(
            {
                innerRef: () => undefined,
                draggableProps: {},
                dragHandleProps: {},
            },
            { isDragging: false }
        ),
}));

// Card only reads `formatTimeYmdHm` from Timeline, but importing the real
// module pulls in sessionManager -> workers -> worker-loader/nedb, none of
// which has anything to do with click routing.
jest.mock('../../Visualization/Timeline', () => ({
    formatTimeYmdHm: (time: number) => `time-${time}`,
}));

import { Card } from './Card';

describe('Card content clicks', () => {
    let container: HTMLDivElement;

    // Card currently reads nothing from the redux store (content tags are
    // extracted on demand now, no registry to select); keep a constant store
    // so the Provider setup stays representative for store-connected props.
    const store = createStore(() => ({})) as any;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        container.remove();
        document.body.innerHTML = '';
    });

    const renderCard = (content: string, extraProps: any = {}) => {
        const actions = {
            setEditCard: jest.fn(),
            setSearchReg: jest.fn(),
            setContent: jest.fn(),
        };
        const props: any = {
            _id: 'card-1',
            cardId: 'card-1',
            title: 'Test card',
            content,
            sessionIds: [],
            spentTimeInHour: { estimated: 0, actual: 0 },
            createdTime: 1600000000000,
            index: 0,
            listId: 'list-1',
            boardId: 'board-1',
            isDraggingOver: false,
            ...actions,
            ...extraProps,
        };

        render(
            <Provider store={store}>
                <Card {...props} />
            </Provider>,
            { container }
        );

        return actions;
    };

    /**
     * Dispatch a real bubbling MouseEvent so the handler sees the native
     * target and the caller can inspect whether the default action survived.
     */
    const click = (el: Element): MouseEvent => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        act(() => {
            el.dispatchEvent(event);
        });
        return event;
    };

    it('opens the card editor when the markdown body (not a link) is clicked', () => {
        const actions = renderCard('just some text');

        const paragraph = container.querySelector('p') as HTMLElement;
        expect(paragraph).not.toBeNull();
        const event = click(paragraph);

        expect(actions.setEditCard).toHaveBeenCalledTimes(1);
        expect(actions.setEditCard).toHaveBeenCalledWith(true, 'list-1', 'card-1');
        expect(event.defaultPrevented).toBe(false);
    });

    it('opens the card editor when the title is clicked', () => {
        const actions = renderCard('body');

        const title = container.querySelector('h1') as HTMLElement;
        expect(title).not.toBeNull();
        click(title);

        expect(actions.setEditCard).toHaveBeenCalledWith(true, 'list-1', 'card-1');
    });

    it('does NOT open the editor when a link is clicked, and leaves the default action intact', () => {
        const actions = renderCard('see [the docs](https://example.com/docs) for details');

        const anchor = container.querySelector('a') as HTMLElement;
        expect(anchor).not.toBeNull();
        // the anchor must keep the attribute the main process relies on to
        // hand the URL to the external browser
        expect(anchor.getAttribute('target')).toBe('_blank');
        const event = click(anchor);

        expect(actions.setEditCard).not.toHaveBeenCalled();
        expect(actions.setSearchReg).not.toHaveBeenCalled();
        // no preventDefault: the browser still opens the URL
        expect(event.defaultPrevented).toBe(false);
    });

    it('does NOT open the editor when a link is the whole card content', () => {
        const actions = renderCard('[click me](https://example.com)');

        const anchor = container.querySelector('a') as HTMLElement;
        expect(anchor).not.toBeNull();
        click(anchor);

        expect(actions.setEditCard).not.toHaveBeenCalled();
    });

    it('still sets the search regex when a #tag is clicked', () => {
        const actions = renderCard('deploy #prod now');

        const tag = container.querySelector('.pl-tag') as HTMLElement;
        expect(tag).not.toBeNull();
        click(tag);

        expect(actions.setSearchReg).toHaveBeenCalledWith('#prod');
        expect(actions.setEditCard).not.toHaveBeenCalled();
    });

    it('still toggles a checkbox without opening the editor', () => {
        const actions = renderCard('- [ ] todo');

        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox).not.toBeNull();
        click(checkbox);

        expect(actions.setContent).toHaveBeenCalledWith('card-1', '- [x] todo');
        expect(actions.setEditCard).not.toHaveBeenCalled();
    });

    it('defers markdown for off-screen cards until they intersect the viewport', () => {
        const original = (globalThis as any).IntersectionObserver;
        const callbacks: Array<(entries: any[]) => void> = [];
        class MockIntersectionObserver {
            constructor(callback: (entries: any[]) => void) {
                callbacks.push(callback);
            }
            observe() {}
            disconnect() {}
        }
        (globalThis as any).IntersectionObserver = MockIntersectionObserver;

        try {
            renderCard('**deferred body**', { initiallyVisible: false });
            // The lightweight preview exists, but marked has not produced a
            // paragraph from the markdown yet.
            expect(container.querySelector('p')).toBeNull();
            expect(container.textContent).toContain('deferred body');

            act(() => {
                callbacks.forEach((callback) => callback([{ isIntersecting: true }]));
            });
            expect(container.querySelector('p')?.textContent).toBe('deferred body');
        } finally {
            (globalThis as any).IntersectionObserver = original;
        }
    });
});
