import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import WindowControls from './WindowControls';

const buttons = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];

describe('WindowControls (frameless caption buttons)', () => {
    it('renders minimize / maximize / close wired to the windowAction IPC', () => {
        const windowAction = jest.fn();
        (window as any).api = { windowAction };

        const { container } = render(<WindowControls />);
        const rendered = buttons(container);
        expect(rendered).toHaveLength(3);
        expect(rendered.map((b) => b.getAttribute('title'))).toEqual([
            'Minimize',
            'Maximize',
            'Close',
        ]);

        rendered.forEach((button) => fireEvent.click(button));
        expect(windowAction).toHaveBeenNthCalledWith(1, 'minimize');
        expect(windowAction).toHaveBeenNthCalledWith(2, 'maximize');
        expect(windowAction).toHaveBeenNthCalledWith(3, 'close');
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

        expect(container.querySelector('.anticon-switcher')).not.toBeNull();
        expect(container.querySelector('.anticon-border')).toBeNull();

        // The button keeps toggling the same window action: the window is
        // maximized, so the main process unmaximizes it.
        fireEvent.click(rendered[1]);
        expect(windowAction).toHaveBeenCalledWith('maximize');
    });
});
