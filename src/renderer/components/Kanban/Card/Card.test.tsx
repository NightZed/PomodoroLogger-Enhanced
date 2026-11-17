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
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
// module pulls in sessionManager -> workers -> native workers/SQLite, none of
// which has anything to do with click routing.
jest.mock('../../Visualization/Timeline', () => ({
    formatTimeYmdHm: (time: number) => `time-${time}`,
}));

import { Card } from './Card';
import { dragActivity } from '../dragActivity';

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

    it('does not trigger the board search from a preview card', () => {
        const actions = renderCard('deploy #prod now', { preview: true });

        const tag = container.querySelector('.pl-tag') as HTMLElement;
        expect(tag).not.toBeNull();
        click(tag);

        expect(actions.setSearchReg).not.toHaveBeenCalled();
        expect(actions.setEditCard).not.toHaveBeenCalled();
        expect(container.querySelector('.kanban-card-preview')).not.toBeNull();
        expect(container.querySelector('.kanban-card')).toBeNull();
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
        const event = click(checkbox);

        expect(actions.setContent).toHaveBeenCalledWith('card-1', '- [x] todo');
        expect(actions.setEditCard).not.toHaveBeenCalled();
        // The React state owns the checkbox; the browser must not flip it first.
        expect(event.defaultPrevented).toBe(true);
    });

    it('renders only the title in title view', () => {
        renderCard('body text', { cardView: 'title' });

        expect(container.querySelector('h3')?.textContent).toBe('Test card');
        expect(container.querySelector('p')).toBeNull();
        expect(container.textContent).not.toContain('body text');
    });

    it('limits the body height in preview view', () => {
        renderCard('body text', { cardView: 'preview' });

        const body = container.querySelector('p')?.parentElement as HTMLElement;
        expect(body).not.toBeNull();
        expect(body.style.maxHeight).toBe('250px');
    });

    it('leaves the body unclipped in full view', () => {
        renderCard('body text', { cardView: 'full' });

        const body = container.querySelector('p')?.parentElement as HTMLElement;
        expect(body).not.toBeNull();
        expect(body.style.maxHeight).toBe('');
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

    // The highlight lives in React state rather than a `:hover` rule so it
    // survives dnd moving the card under the pointer during the drop animation
    // (see Card.tsx). jsdom cannot evaluate `:hover`, so this also proves the
    // state path is actually wired to the pointer events.
    it('lights the card while the pointer is over it', () => {
        renderCard('body');
        const card = container.querySelector('.kanban-card') as HTMLElement;

        expect(card).not.toBeNull();
        expect(getComputedStyle(card).backgroundImage).toBe('none');

        fireEvent.pointerEnter(card);
        expect(getComputedStyle(card).backgroundImage).toContain('linear-gradient');

        fireEvent.pointerLeave(card);
        expect(getComputedStyle(card).backgroundImage).toBe('none');
    });

    // The Timer sidebar renders cards with `preview` (no drag, click to edit).
    // They are still hover targets, so they get the same shadow.
    it('highlights a preview card on hover too', () => {
        renderCard('body', { preview: true });
        const card = container.querySelector('.kanban-card-preview') as HTMLElement;

        expect(card).not.toBeNull();
        expect(getComputedStyle(card).backgroundImage).toBe('none');

        fireEvent.pointerEnter(card);
        expect(getComputedStyle(card).backgroundImage).toContain('linear-gradient');
    });

    // Regression: while dnd's drop clone covers the pointer the browser never
    // puts the destination card in its hover chain, so no `pointerleave` is
    // sent when the pointer moves away -- a card hovered only briefly kept its
    // shadow. The card now watches the pointer geometry itself.
    it('clears the highlight when the pointer moves outside the card', () => {
        renderCard('body');
        const card = container.querySelector('.kanban-card') as HTMLElement;
        fireEvent.pointerEnter(card);
        expect(getComputedStyle(card).backgroundImage).toContain('linear-gradient');

        // jsdom reports a 0x0 rect, so any real coordinate is outside it.
        fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });

        expect(getComputedStyle(card).backgroundImage).toBe('none');
    });

    // Regression: dragging a card out of its list and releasing over empty
    // space left the shadow on. `pointerleave` is ignored for the whole drag,
    // and nothing sends another one once the pointer is already outside.
    it('clears the highlight after a drop when the pointer left the card', () => {
        jest.useFakeTimers();
        const original = (document as any).elementsFromPoint;
        (document as any).elementsFromPoint = () => [];

        try {
            renderCard('body');
            const card = container.querySelector('.kanban-card') as HTMLElement;
            fireEvent.pointerEnter(card);
            expect(getComputedStyle(card).backgroundImage).toContain('linear-gradient');

            dragActivity.pointer = { x: 400, y: 400 };
            dragActivity.lastDropAt = performance.now();
            act(() => {
                window.dispatchEvent(new Event('pointerup'));
                jest.advanceTimersByTime(200);
            });

            expect(getComputedStyle(card).backgroundImage).toBe('none');
        } finally {
            (document as any).elementsFromPoint = original;
            dragActivity.pointer = null;
            dragActivity.lastDropAt = 0;
            jest.useRealTimers();
        }
    });

    // Regression: a card dropped into another list is a new component instance,
    // so it never received a pointerenter. The highlight used to stay off until
    // the user moved the mouse -- the card visibly un-lit and then came back.
    // On mount the card now asks the document whether the pointer is on it.
    it('lights a freshly mounted card when the pointer is already over it', () => {
        const hadElementsFromPoint = 'elementsFromPoint' in document;
        const original = (document as any).elementsFromPoint;
        (document as any).elementsFromPoint = () => {
            const card = container.querySelector('.kanban-card');
            return card ? [card] : [];
        };
        dragActivity.pointer = { x: 10, y: 10 };
        dragActivity.lastDropAt = performance.now();

        try {
            renderCard('body');

            const card = container.querySelector('.kanban-card') as HTMLElement;
            expect(getComputedStyle(card).backgroundImage).toContain('linear-gradient');
        } finally {
            if (hadElementsFromPoint) {
                (document as any).elementsFromPoint = original;
            } else {
                delete (document as any).elementsFromPoint;
            }
            dragActivity.pointer = null;
            dragActivity.lastDropAt = 0;
        }
    });
});
