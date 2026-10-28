import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { UserGuide } from './UserGuide';
import { Story } from './type';

jest.mock('./Pointer', () => ({
    Pointer: (props: any) => {
        (global as any).__pointer = props;
        return <div data-testid="pointer" />;
    },
}));
jest.mock('./Spotlight', () => ({
    Spotlight: (props: any) => {
        (global as any).__spotlight = props;
        return <div data-testid="spotlight" data-through={String(!!props.clickThrough)} />;
    },
}));

const steps: Story[] = [
    { stepId: 'one', name: 'one', hint: 'First step', useMask: true, hasConfirm: true },
    {
        stepId: 'two',
        name: 'two',
        hint: 'Second step',
        useMask: true,
        spotlight: true,
        hasConfirm: true,
        pointerTargetSelector: '#spot',
    },
    {
        stepId: 'three',
        name: 'three',
        hint: 'Third step',
        useMask: true,
        spotlight: true,
        hasConfirm: true,
        advanceOnTargetClick: true,
        pointerTargetSelector: '#spot',
    },
    {
        stepId: 'four',
        name: 'four',
        hint: 'Fourth step',
        useMask: false,
        hasConfirm: true,
        confirmElementId: 'confirm-me',
    },
];

const renderGuide = (index = 0, name: string | null = 'test') => {
    const store = createStore((state: any) => state, {
        story: { stories: { test: steps }, index, name },
    });
    const dispatch = jest.spyOn(store, 'dispatch');
    const view = render(
        <Provider store={store}>
            <UserGuide />
        </Provider>
    );
    return { ...view, dispatch };
};

const target = () => {
    let element = document.getElementById('spot');
    if (!element) {
        element = document.createElement('div');
        element.id = 'spot';
        element.getBoundingClientRect = () =>
            ({ left: 10, top: 20, width: 30, height: 40, right: 40, bottom: 60 }) as DOMRect;
        document.body.appendChild(element);
    }
    return element;
};

const advance = (ms: number) =>
    act(() => {
        jest.advanceTimersByTime(ms);
    });

describe('UserGuide', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        window.localStorage.clear();
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.useRealTimers();
        delete (global as any).__pointer;
        delete (global as any).__spotlight;
    });

    it('renders nothing while no tour is running', () => {
        const { container } = renderGuide(0, null);

        expect(container.innerHTML).toBe('');
    });

    it('shows the step, saves progress and can be exited', () => {
        const { getByText, getByRole, dispatch } = renderGuide(0);

        expect(getByText('First step')).toBeTruthy();
        expect(getByText('Step 1 / 4')).toBeTruthy();
        expect(window.localStorage.getItem('pl-tour-progress')).toBe(
            JSON.stringify({ stepId: 'one', name: 'one' })
        );

        fireEvent.click(getByRole('button', { name: 'Exit tour' }));
        expect(dispatch).toHaveBeenCalledWith({ type: '[Guide]QUIT' });
    });

    it('advances on OK and goes back on Back', () => {
        const { getByRole, dispatch } = renderGuide(2);
        target();

        fireEvent.click(getByRole('button', { name: 'Back' }));
        expect(dispatch).toHaveBeenCalledWith({ type: '[Guide]PRE_STORY' });

        fireEvent.click(getByRole('button', { name: 'Take me there' }));
        advance(350);
        expect(dispatch).toHaveBeenCalledWith({ type: '[Guide]NEXT_STORY' });
    });

    it('renders the pointer and a click-blocking spotlight for demo steps', () => {
        const { getByTestId } = renderGuide(1);
        target();

        expect(getByTestId('pointer')).toBeTruthy();
        expect(getByTestId('spotlight').getAttribute('data-through')).toBe('false');
    });

    it('lets navigation steps click through the spotlight', () => {
        const { getByTestId } = renderGuide(2);
        target();

        expect(getByTestId('spotlight').getAttribute('data-through')).toBe('true');
    });

    it('waits for a target that is not mounted yet', () => {
        const { getByText, queryByTestId } = renderGuide(1);

        expect(getByText(/Waiting for the highlighted area to appear/)).toBeTruthy();

        act(() => {
            (global as any).__pointer.onTargetRect({ x: 0, y: 0, w: 10, h: 10 });
        });

        expect(getByText('Second step')).toBeTruthy();
        expect(queryByTestId('spotlight')).toBeTruthy();
    });

    it('advances when the highlighted target is clicked', () => {
        const { dispatch } = renderGuide(2);
        const spot = target();

        fireEvent.click(spot);
        advance(350);

        expect(dispatch).toHaveBeenCalledWith({ type: '[Guide]NEXT_STORY' });
    });

    it('advances when the step confirm element is clicked', () => {
        const confirm = document.createElement('button');
        confirm.id = 'confirm-me';
        document.body.appendChild(confirm);
        const { dispatch } = renderGuide(3);

        fireEvent.click(confirm);
        advance(200);

        expect(dispatch).toHaveBeenCalledWith({ type: '[Guide]NEXT_STORY' });
    });

    it('does not advance after unmounting before the delay', () => {
        const { getByRole, dispatch, unmount } = renderGuide(0);

        fireEvent.click(getByRole('button', { name: 'OK' }));
        unmount();
        advance(500);

        expect(dispatch).not.toHaveBeenCalledWith({ type: '[Guide]NEXT_STORY' });
    });
});
