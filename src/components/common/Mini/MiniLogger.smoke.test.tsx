import React from 'react';
import TestRenderer, { ReactTestRendererJSON } from 'react-test-renderer';
import { MiniLogger } from './MiniLogger';

const baseProps = {
    play: jest.fn(),
    pause: jest.fn(),
    done: jest.fn(),
    clear: jest.fn(),
    switch: jest.fn(),
    expand: jest.fn(),
    confirm: jest.fn(),
    confirmAndStartNextSession: jest.fn(),
    extendCurrentSession: jest.fn(),
    time: '25',
    percentage: 0,
    isRunning: false,
    isFocusing: true,
    isConfirming: false,
    task: '完成 MiniLogger 重构',
};

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

const classNameOf = (n: ReactTestRendererJSON) => String(n.props?.className || '');

describe('MiniLogger two-row mini layout', () => {
    it('renders task row on top and control row below the divider', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} />
        ).toJSON() as ReactTestRendererJSON;
        const controlRows = findAll(tree, (n) => classNameOf(n).includes('control-row'));
        const taskRows = findAll(tree, (n) => classNameOf(n).includes('task-row'));
        expect(controlRows).toHaveLength(1);
        expect(taskRows).toHaveLength(1);
        const taskNodes = findAll(
            tree,
            (n) => classNameOf(n).split(' ').includes('task') && n.type === 'div'
        );
        expect(taskNodes).toHaveLength(1);
        expect(taskNodes[0].children).toContain('完成 MiniLogger 重构');
    });

    it('fills the inner disc with the working color while focusing', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} />
        ).toJSON() as ReactTestRendererJSON;
        const circles = findAll(tree, (n) => n.type === 'circle');
        expect(circles.length).toBeGreaterThan(0);
        expect(circles[0].props.fill).toBe('#e84545');
    });

    it('fills the inner disc with the rest color while resting', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} isFocusing={false} />
        ).toJSON() as ReactTestRendererJSON;
        const circles = findAll(tree, (n) => n.type === 'circle');
        expect(circles.length).toBeGreaterThan(0);
        expect(circles[0].props.fill).toBe('#2b2e4a');
    });

    it('renders exactly 4 ghost control buttons in normal mode', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} isRunning percentage={50} />
        ).toJSON() as ReactTestRendererJSON;
        const buttons = findAll(tree, (n) => n.type === 'button');
        expect(buttons).toHaveLength(4);
    });

    it('never renders the removed status icons (fire / coffee / check-circle)', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} isConfirming />
        ).toJSON() as ReactTestRendererJSON;
        const iconClasses = findAll(tree, (n) => classNameOf(n).includes('anticon'))
            .map(classNameOf)
            .join(' ');
        expect(iconClasses).not.toContain('anticon-fire');
        expect(iconClasses).not.toContain('anticon-coffee');
        expect(iconClasses).not.toContain('anticon-check-circle');
    });

    it('shows a default placeholder when no project is selected', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} task="" />
        ).toJSON() as ReactTestRendererJSON;
        const taskNodes = findAll(
            tree,
            (n) => classNameOf(n).split(' ').includes('task') && n.type === 'div'
        );
        expect(taskNodes).toHaveLength(1);
        expect(taskNodes[0].children).toContain('No Focusing Project');
    });

    it('keeps the right side filled after a rest, with Clear disabled', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} isConfirming isFocusing={false} />
        ).toJSON() as ReactTestRendererJSON;
        const buttons = findAll(tree, (n) => n.type === 'button');
        // left: Start Next Session + Done; right: Clear + Expand (never hidden)
        expect(buttons).toHaveLength(4);
        const hasIcon = (b: ReactTestRendererJSON, name: string) =>
            findAll(b, (n) => classNameOf(n).includes(`anticon-${name}`)).length > 0;
        expect(hasIcon(buttons[2], 'close')).toBe(true);
        expect(buttons[2].props.disabled).toBe(true);
        expect(hasIcon(buttons[3], 'fullscreen')).toBe(true);
        expect(buttons[3].props.disabled).toBeFalsy();
    });

    it('exposes the timer state via a native SVG title, like the buttons', () => {
        const stateLabel = (props: Partial<typeof baseProps>) => {
            const tree = TestRenderer.create(
                <MiniLogger {...baseProps} {...props} />
            ).toJSON() as ReactTestRendererJSON;
            const titles = findAll(tree, (n) => n.type === 'title');
            expect(titles.length).toBeGreaterThan(0);
            return titles[0].children;
        };
        expect(stateLabel({})).toContain('working');
        expect(stateLabel({ isFocusing: false })).toContain('breaking');
        expect(stateLabel({ isConfirming: true })).toContain('done');
    });
});
