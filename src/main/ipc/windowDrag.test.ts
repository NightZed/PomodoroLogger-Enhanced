/**
 * The maximized-window drag: the geometry that keeps the grabbed spot of the
 * title bar under the cursor, and the drag session around it.
 *
 * The mapping is the whole point of the module -- the native Windows behavior it
 * reproduces (drag a maximized window and it shrinks under the cursor) depends
 * on it, and a wrong one only shows up as the window sliding out from under the
 * user's cursor. `screen` is the one Electron module the session touches, so it
 * is replaced by a stub and the window is a plain object.
 */
import type { BrowserWindow, Rectangle } from 'electron';
import { restorePositionForCursor, startWindowDrag, stopWindowDrag } from './windowDrag';

jest.mock('electron', () => ({ screen: { getCursorScreenPoint: jest.fn() } }));

const screenMock = require('electron').screen as { getCursorScreenPoint: jest.Mock };

/** A window stub that keeps its own bounds, like the real one does. */
function fakeWindow(maximizedBounds: Rectangle, normalBounds: Rectangle, maximized: boolean) {
    // Where the window sits right now: the work area if it is maximized,
    // otherwise the bounds a restore would go back to.
    let bounds = { ...(maximized ? maximizedBounds : normalBounds) };
    let isMaximized = maximized;

    const win = {
        isMaximized: jest.fn(() => isMaximized),
        getBounds: jest.fn((): Rectangle => ({ ...bounds })),
        // A transparent window's unmaximize() puts the pre-maximize bounds back.
        unmaximize: jest.fn(() => {
            isMaximized = false;
            bounds = { ...normalBounds };
        }),
        setPosition: jest.fn((x: number, y: number) => {
            bounds = { ...bounds, x, y };
        }),
        isDestroyed: jest.fn(() => false),
    };

    return win as unknown as BrowserWindow & typeof win;
}

describe('restorePositionForCursor', () => {
    const maximized = { x: 0, y: 0, width: 1920, height: 1080 };
    const restored = { width: 1440, height: 960 };

    it('keeps the grabbed spot of the title bar under the cursor', () => {
        // A quarter into the bar, on the bar's vertical center.
        expect(restorePositionForCursor({ x: 480, y: 18 }, maximized, restored)).toEqual({
            x: 120,
            y: 2,
        });
    });

    it('centers the restored window on a cursor in the middle of the screen', () => {
        // Half of both axes: 1920/2 - 1440/2 and 1080/2 - 960/2.
        expect(restorePositionForCursor({ x: 960, y: 540 }, maximized, restored)).toEqual({
            x: 240,
            y: 60,
        });
    });

    it('falls back to the middle instead of dividing by a zero sized window', () => {
        expect(
            restorePositionForCursor(
                { x: 100, y: 100 },
                { x: 0, y: 0, width: 0, height: 0 },
                restored
            )
        ).toEqual({ x: -620, y: -380 });
    });
});

describe('window drag session', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
    const normalBounds = { x: 200, y: 150, width: 1440, height: 960 };

    beforeEach(() => {
        jest.useFakeTimers();
        screenMock.getCursorScreenPoint.mockReset();
    });

    afterEach(() => {
        stopWindowDrag();
        jest.useRealTimers();
    });

    it('restores a maximized window under the cursor, then follows it', () => {
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 480, y: 18 });
        const win = fakeWindow(workArea, normalBounds, true);

        startWindowDrag(win);

        // The size comes back from unmaximize(); only the position is computed,
        // and it is the point of the old bar that has to stay under the cursor.
        expect(win.unmaximize).toHaveBeenCalledTimes(1);
        expect(win.setPosition).toHaveBeenNthCalledWith(1, 120, 2);

        // Cursor moved 10px down-right: the window keeps its grab offset (the
        // 360/16 difference between the cursor and the repositioned window).
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 490, y: 28 });
        jest.advanceTimersByTime(16);
        expect(win.setPosition).toHaveBeenNthCalledWith(2, 130, 12);
    });

    it('just follows the cursor while the window is not maximized', () => {
        // The renderer only reports a gesture while the window is maximized, but
        // its state can be one push behind: the drag then has to behave like any
        // other move instead of restoring anything.
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 400, y: 200 });
        const win = fakeWindow(workArea, normalBounds, false);

        startWindowDrag(win);

        expect(win.unmaximize).not.toHaveBeenCalled();
        // The offset is the cursor's position inside the window, so the first
        // tick keeps the window exactly where it is.
        jest.advanceTimersByTime(16);
        expect(win.setPosition).toHaveBeenNthCalledWith(1, normalBounds.x, normalBounds.y);

        // From there the window follows the cursor one to one.
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 420, y: 230 });
        jest.advanceTimersByTime(16);
        expect(win.setPosition).toHaveBeenNthCalledWith(
            2,
            normalBounds.x + 20,
            normalBounds.y + 30
        );
    });

    it('stops following the cursor once the gesture ended', () => {
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 400, y: 200 });
        const win = fakeWindow(workArea, normalBounds, false);
        startWindowDrag(win);

        stopWindowDrag();
        win.setPosition.mockClear();
        jest.advanceTimersByTime(160);

        expect(win.setPosition).not.toHaveBeenCalled();
    });

    it('gives up on a gesture the renderer never ended', () => {
        // Safety net: a renderer that died mid-drag must not leave the window
        // glued to the cursor.
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 400, y: 200 });
        const win = fakeWindow(workArea, normalBounds, false);
        startWindowDrag(win);

        jest.advanceTimersByTime(30000);
        win.setPosition.mockClear();
        screenMock.getCursorScreenPoint.mockReturnValue({ x: 600, y: 400 });
        jest.advanceTimersByTime(160);

        expect(win.setPosition).not.toHaveBeenCalled();
    });
});
