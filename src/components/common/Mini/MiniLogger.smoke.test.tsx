import React from 'react';
import TestRenderer, { ReactTestRendererJSON } from 'react-test-renderer';
import { MiniLogger } from './MiniLogger';

const baseProps = {
    play: jest.fn(),
    pause: jest.fn(),
    finish: jest.fn(),
    stop: jest.fn(),
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
    hasSession: false,
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
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} />
        ).toJSON() as ReactTestRendererJSON;
        const buttons = findAll(tree, (n) => n.type === 'button');
        expect(buttons).toHaveLength(4);
    });

    it('shows Finish as soon as a session exists, even while percentage is still 0', () => {
        // The percentage arrives in 2% steps (see Timer.updateLeftTime), so for
        // the first 2% of a session it is still 0. The left cluster must already
        // offer Finish instead of Switch Mode, exactly like the normal/compact
        // pages, which read the timer state instead of the percentage.
        const leftClusterIcons = (props: Partial<typeof baseProps>) => {
            const tree = TestRenderer.create(
                <MiniLogger {...baseProps} {...props} />
            ).toJSON() as ReactTestRendererJSON;
            const left = findAll(tree, (n) => classNameOf(n).includes('btn-side left'));
            expect(left).toHaveLength(1);
            const icons = findAll(left[0], (n) => classNameOf(n).includes('anticon-'))
                .map(classNameOf)
                .join(' ');
            return {
                swap: icons.includes('anticon-swap'),
                check: icons.includes('anticon-check'),
                finish: findAll(left[0], (n) => n.type === 'button').some(
                    (button) => button.props.title === 'Finish'
                ),
            };
        };

        expect(leftClusterIcons({ hasSession: true, percentage: 0 })).toEqual({
            swap: false,
            check: true,
            finish: true,
        });
        expect(leftClusterIcons({ hasSession: true, percentage: 3 })).toEqual({
            swap: false,
            check: true,
            finish: true,
        });
        expect(leftClusterIcons({ hasSession: false, percentage: 0 })).toEqual({
            swap: true,
            check: false,
            finish: false,
        });
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

    it('keeps the right side filled after a rest, with Stop disabled', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} isConfirming isFocusing={false} />
        ).toJSON() as ReactTestRendererJSON;
        const buttons = findAll(tree, (n) => n.type === 'button');
        // left: Start Next Session + Finish; right: Stop + Expand (never hidden)
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
            // react-test-renderer keeps the text child as a string array.
            return (titles[0].children || []).join('');
        };
        expect(stateLabel({})).toContain('Working');
        expect(stateLabel({ isFocusing: false })).toContain('Breaking');
        expect(stateLabel({ isConfirming: true })).toContain('Finish');
        expect(stateLabel({ hasSession: true, isRunning: true })).toContain('Running');
        expect(stateLabel({ hasSession: true, isRunning: false })).toContain('Paused');
    });

    it('walks the second hand clockwise from 12 o clock', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={125} />
        ).toJSON() as ReactTestRendererJSON;
        const orbits = findAll(tree, (n) => classNameOf(n).includes('timer-orbit'));
        expect(orbits).toHaveLength(1);
        // Fresh mount starts a new round at 12 o'clock: the first render
        // anchors the base, so the angle is 0deg.
        expect(orbits[0].props.style.transform).toBe('rotate(0deg)');
        const badges = findAll(tree, (n) => classNameOf(n).includes('timer-paused-badge'));
        expect(badges).toHaveLength(0);
    });

    it('advances the second hand clockwise as the countdown decreases', () => {
        const renderer = TestRenderer.create(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={125} />
        );
        const angleOf = () => {
            const tree = renderer.toJSON() as ReactTestRendererJSON;
            const orbits = findAll(tree, (n) => classNameOf(n).includes('timer-orbit'));
            expect(orbits).toHaveLength(1);
            return orbits[0].props.style.transform;
        };
        expect(angleOf()).toBe('rotate(0deg)');
        // One elapsed second -> +6deg clockwise (not 30deg -> 24deg backwards).
        renderer.update(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={124} />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        // Across the minute wrap the angle keeps growing (354deg -> 360deg,
        // the same dial position as 0deg) instead of sweeping backwards.
        renderer.update(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={65} />
        );
        const beforeWrap = angleOf();
        renderer.update(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={64} />
        );
        const afterWrap = angleOf();
        const degrees = (t: string) => Number(t.replace('rotate(', '').replace('deg)', ''));
        expect(degrees(afterWrap)).toBeGreaterThan(degrees(beforeWrap));
        expect(degrees(afterWrap) - degrees(beforeWrap)).toBe(6);
    });

    it('dims the dial and badges pause instead of ticking while paused', () => {
        const renderer = TestRenderer.create(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={125} />
        );
        const angleOf = () => {
            const tree = renderer.toJSON() as ReactTestRendererJSON;
            const orbits = findAll(tree, (n) => classNameOf(n).includes('timer-orbit'));
            expect(orbits).toHaveLength(1);
            return orbits[0].props.style.transform;
        };
        renderer.update(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={124} />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        // Pause repeats the frozen value: the hand holds its detent (only
        // opacity flips via the styled rule, invisible to the snapshot).
        renderer.update(
            <MiniLogger
                {...baseProps}
                hasSession
                isRunning={false}
                percentage={50}
                secondsLeft={124}
            />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        const tree = renderer.toJSON() as ReactTestRendererJSON;
        const svgs = findAll(
            tree,
            (n) => n.type === 'svg' && classNameOf(n).split(' ').includes('timer-svg')
        );
        expect(svgs).toHaveLength(1);
        expect(classNameOf(svgs[0])).toContain('is-paused');
        const badges = findAll(tree, (n) => classNameOf(n).includes('timer-paused-badge'));
        expect(badges).toHaveLength(1);
        // The time text itself stays rendered so the remaining time is never hidden.
        const texts = findAll(tree, (n) => n.type === 'text');
        expect(texts.length).toBeGreaterThan(0);
        // Resume continues from the frozen detent instead of jumping back.
        renderer.update(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={123} />
        );
        expect(angleOf()).toBe('rotate(12deg)');
    });

    it('hides the second hand while idle', () => {
        const tree = TestRenderer.create(
            <MiniLogger {...baseProps} hasSession={false} isRunning={false} percentage={0} />
        ).toJSON() as ReactTestRendererJSON;
        const orbits = findAll(tree, (n) => classNameOf(n).includes('timer-orbit'));
        expect(orbits).toHaveLength(0);
    });

    it('sweeps a single highlight while confirming: one animated node, static ticks', () => {
        jest.useFakeTimers();
        try {
            const renderer = TestRenderer.create(
                <MiniLogger {...baseProps} isConfirming hasSession isRunning />
            );
            const tree = renderer.toJSON() as ReactTestRendererJSON;
            // One rotating highlight instead of eighteen animated ticks.
            const sweeps = findAll(tree, (n) => classNameOf(n).includes('timer-confirm'));
            expect(sweeps).toHaveLength(1);
            // All 18 base ticks stay static: no per-tick animation delay.
            const lines = findAll(tree, (n) => n.type === 'line');
            expect(lines.length).toBeGreaterThanOrEqual(18);
            lines.forEach((line) => {
                expect(line.props.style?.animationDelay).toBeUndefined();
            });
            // No second hand or pause badge while confirming.
            const orbits = findAll(tree, (n) => classNameOf(n).includes('timer-orbit'));
            expect(orbits).toHaveLength(0);
            const badges = findAll(tree, (n) => classNameOf(n).includes('timer-paused-badge'));
            expect(badges).toHaveLength(0);
            // Long-idle freeze: after ~60s the sweep pauses itself.
            const instance = renderer.getInstance() as MiniLogger | null;
            expect(instance?.state.confirmSweepFrozen).toBe(false);
            jest.advanceTimersByTime(60000);
            expect(instance?.state.confirmSweepFrozen).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });
});
