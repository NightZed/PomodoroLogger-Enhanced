import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import WindowControls from './WindowControls';
import { subscribeWindowHideIntent } from './windowHideIntent';

const buttons = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];

describe('WindowControls (frameless caption buttons)', () => {
    let frames: FrameRequestCallback[];

    beforeEach(() => {
        frames = [];
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            frames.push(callback);
            return frames.length;
        });
    });

    afterEach(() => {
        (window.requestAnimationFrame as jest.Mock).mockRestore();
    });

    /** Runs whatever was queued for the coming frame. */
    const flushFrame = () => {
        const queued = frames;
        frames = [];
        queued.forEach((callback) => callback(0));
    };

    it('renders minimize / maximize / close', () => {
        (window as any).api = { windowAction: jest.fn() };

        const { container } = render(<WindowControls />);
        const rendered = buttons(container);
        expect(rendered).toHaveLength(3);
        expect(rendered.map((b) => b.getAttribute('title'))).toEqual([
            'Minimize',
            'Maximize',
            'Close',
        ]);
    });

    it('hands the window over immediately when minimizing or maximizing', () => {
        const windowAction = jest.fn();
        (window as any).api = { windowAction };
        const listener = jest.fn();
        const unsubscribe = subscribeWindowHideIntent(listener);

        try {
            const { container } = render(<WindowControls />);
            const [minimize, maximize] = buttons(container);

            fireEvent.click(minimize);
            expect(listener).not.toHaveBeenCalled();
            expect(windowAction).toHaveBeenCalledWith('minimize');

            fireEvent.click(maximize);
            expect(windowAction).toHaveBeenLastCalledWith('maximize');
        } finally {
            unsubscribe();
        }
    });

    it('lets the page drop its content one frame before closing', () => {
        // Regression: the window keeps its last painted frame and shows it again
        // for a moment when restored, so a panel closed only after the tray
        // event had landed flashed back on every restore.
        const windowAction = jest.fn();
        (window as any).api = { windowAction };
        const listener = jest.fn();
        const unsubscribe = subscribeWindowHideIntent(listener);

        try {
            const { container } = render(<WindowControls />);
            const [, , close] = buttons(container);

            fireEvent.click(close);
            // The page is told first...
            expect(listener).toHaveBeenCalledTimes(1);
            expect(windowAction).not.toHaveBeenCalled();

            // ...gets a frame to actually paint the result...
            flushFrame();
            expect(windowAction).not.toHaveBeenCalled();

            // ...and only then is the window closed.
            flushFrame();
            expect(windowAction).toHaveBeenCalledWith('close');
        } finally {
            unsubscribe();
        }
    });

    it('offers to restore the window while it is maximized', () => {
        // The state is reported by the main process (the renderer cannot read it:
        // a maximized transparent window is emulated by resizing), and antd 3
        // draws the restore glyph with `switcher`, where `border` is maximize.
        const windowAction = jest.fn();
        (window as any).api = { windowAction };

        const { container } = render(<WindowControls maximized />);
        const rendered = buttons(container);
        expect(rendered.map((b) => b.getAttribute('title'))).toEqual([
            'Minimize',
            'Restore Down',
            'Close',
        ]);

        // The button keeps toggling the same window action: the window is
        // maximized, so the main process unmaximizes it.
        fireEvent.click(rendered[1]);
        expect(windowAction).toHaveBeenCalledWith('maximize');
    });
});
