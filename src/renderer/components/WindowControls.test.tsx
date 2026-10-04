import React from 'react';
import TestRenderer, { ReactTestRendererJSON } from 'react-test-renderer';
import WindowControls from './WindowControls';

function findAll(
    node: ReactTestRendererJSON | null,
    predicate: (n: ReactTestRendererJSON) => boolean
): ReactTestRendererJSON[] {
    const result: ReactTestRendererJSON[] = [];
    const walk = (n: ReactTestRendererJSON | null) => {
        if (!n) return;
        if (predicate(n)) result.push(n);
        if (Array.isArray(n.children)) {
            n.children.forEach((c) => walk(typeof c === 'string' ? null : c));
        }
    };
    walk(node);
    return result;
}

describe('WindowControls (frameless caption buttons)', () => {
    it('renders minimize / maximize / close wired to the windowAction IPC', () => {
        const windowAction = jest.fn();
        (window as any).api = { windowAction };

        const tree = TestRenderer.create(<WindowControls />).toJSON() as ReactTestRendererJSON;
        const buttons = findAll(tree, (n) => n.type === 'button');
        expect(buttons).toHaveLength(3);
        expect(buttons.map((b) => b.props.title)).toEqual(['Minimize', 'Maximize', 'Close']);

        buttons.forEach((b) => b.props.onClick());
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

        const tree = TestRenderer.create(
            <WindowControls maximized />
        ).toJSON() as ReactTestRendererJSON;

        const buttons = findAll(tree, (n) => n.type === 'button');
        expect(buttons.map((b) => b.props.title)).toEqual(['Minimize', 'Restore Down', 'Close']);

        const iconClasses = findAll(tree, (n) => n.type === 'i').map((n) =>
            String(n.props.className)
        );
        expect(iconClasses.some((className) => className.includes('anticon-switcher'))).toBe(true);
        expect(iconClasses.some((className) => className.includes('anticon-border'))).toBe(false);

        // The button keeps toggling the same window action: the window is
        // maximized, so the main process unmaximizes it.
        buttons[1].props.onClick();
        expect(windowAction).toHaveBeenCalledWith('maximize');
    });
});
