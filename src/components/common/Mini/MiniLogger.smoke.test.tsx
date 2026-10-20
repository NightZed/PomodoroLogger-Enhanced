import React, { act } from 'react';
import { render } from '@testing-library/react';
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
    secondsLeft: undefined as number | undefined,
    task: 'MiniLogger regression test',
};

const classNameOf = (node: Element | null) => node?.getAttribute('class') ?? '';

const all = (container: HTMLElement, selector: string) =>
    Array.from(container.querySelectorAll(selector));

const withClass = (container: HTMLElement, className: string) =>
    all(container, '[class]').filter((node) => classNameOf(node).split(/\s+/).includes(className));

const buttons = (container: HTMLElement) => all(container, 'button') as HTMLButtonElement[];

const iconClasses = (container: HTMLElement) =>
    all(container, '[class*="anticon-"]')
        .map((node) => classNameOf(node))
        .join(' ');

/** Inline transform of the SVG second hand. */
const transformOf = (node: Element | null) => (node as HTMLElement | null)?.style.transform;

const renderMini = (props: Partial<typeof baseProps> = {}) =>
    render(<MiniLogger {...baseProps} {...props} />);

describe('MiniLogger two-row mini layout', () => {
    it('renders task row on top and control row below the divider', () => {
        const { container } = renderMini();
        expect(withClass(container, 'control-row')).toHaveLength(1);
        expect(withClass(container, 'task-row')).toHaveLength(1);
        const taskNodes = all(container, 'div.task');
        expect(taskNodes).toHaveLength(1);
        expect(taskNodes[0].textContent).toContain('MiniLogger regression test');
    });

    it('fills the inner disc with the working color while focusing', () => {
        const { container } = renderMini();
        const circles = all(container, 'circle');
        expect(circles.length).toBeGreaterThan(0);
        expect(circles[0].getAttribute('fill')).toBe('#e84545');
    });

    it('fills the inner disc with the rest color while resting', () => {
        const { container } = renderMini({ isFocusing: false });
        const circles = all(container, 'circle');
        expect(circles.length).toBeGreaterThan(0);
        expect(circles[0].getAttribute('fill')).toBe('#2b2e4a');
    });

    it('renders exactly 4 ghost control buttons in normal mode', () => {
        const { container } = renderMini({ hasSession: true, isRunning: true, percentage: 50 });
        expect(buttons(container)).toHaveLength(4);
    });

    it('shows Finish as soon as a session exists, even while percentage is still 0', () => {
        // The percentage arrives in 2% steps (see Timer.updateLeftTime), so for
        // the first 2% of a session it is still 0. The left cluster must already
        // offer Finish instead of Switch Mode, exactly like the normal/compact
        // pages, which read the timer state instead of the percentage.
        const leftClusterIcons = (props: Partial<typeof baseProps>) => {
            const { container } = renderMini(props);
            const left = container.querySelector('.btn-side.left');
            expect(left).not.toBeNull();
            const icons = iconClasses(left as HTMLElement);
            return {
                swap: icons.includes('anticon-swap'),
                check: icons.includes('anticon-check'),
                finish: buttons(left as HTMLElement).some(
                    (button) => button.getAttribute('title') === 'Finish'
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
        const { container } = renderMini({ isConfirming: true });
        const icons = iconClasses(container);
        expect(icons).not.toContain('anticon-fire');
        expect(icons).not.toContain('anticon-coffee');
        expect(icons).not.toContain('anticon-check-circle');
    });

    it('shows a default placeholder when no project is selected', () => {
        const { container } = renderMini({ task: '' });
        const taskNodes = all(container, 'div.task');
        expect(taskNodes).toHaveLength(1);
        expect(taskNodes[0].textContent).toContain('No Focusing Project');
    });

    it('keeps the right side filled after a rest, with Stop disabled', () => {
        const { container } = renderMini({ isConfirming: true, isFocusing: false });
        const rendered = buttons(container);
        // left: Start Next Session + Finish; right: Stop + Expand (never hidden)
        expect(rendered).toHaveLength(4);
        expect(rendered[2].querySelector('.anticon-close')).not.toBeNull();
        expect(rendered[2].disabled).toBe(true);
        expect(rendered[3].querySelector('.anticon-fullscreen')).not.toBeNull();
        expect(rendered[3].disabled).toBe(false);
    });

    it('exposes the timer state via a native SVG title, like the buttons', () => {
        const stateLabel = (props: Partial<typeof baseProps>) => {
            const { container } = renderMini(props);
            const title = container.querySelector('title');
            expect(title).not.toBeNull();
            return title?.textContent ?? '';
        };
        expect(stateLabel({})).toContain('Working');
        expect(stateLabel({ isFocusing: false })).toContain('Breaking');
        expect(stateLabel({ isConfirming: true })).toContain('Finish');
        expect(stateLabel({ hasSession: true, isRunning: true })).toContain('Running');
        expect(stateLabel({ hasSession: true, isRunning: false })).toContain('Paused');
    });

    it('walks the second hand clockwise from 12 o clock', () => {
        const { container } = renderMini({
            hasSession: true,
            isRunning: true,
            percentage: 50,
            secondsLeft: 125,
        });
        const orbit = container.querySelector('.timer-orbit');
        expect(orbit).not.toBeNull();
        // Fresh mount starts a new round at 12 o'clock: the first render
        // anchors the base, so the angle is 0deg.
        expect(transformOf(orbit)).toBe('rotate(0deg)');
        expect(container.querySelector('.timer-paused-badge')).toBeNull();
    });

    it('advances the second hand clockwise as the countdown decreases', () => {
        const view = renderMini({
            hasSession: true,
            isRunning: true,
            percentage: 50,
            secondsLeft: 125,
        });
        const angleOf = () => transformOf(view.container.querySelector('.timer-orbit'));
        expect(angleOf()).toBe('rotate(0deg)');
        // One elapsed second -> +6deg clockwise (not 30deg -> 24deg backwards).
        view.rerender(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={124} />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        // Across the minute wrap the angle keeps growing (354deg -> 360deg,
        // the same dial position as 0deg) instead of sweeping backwards.
        view.rerender(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={65} />
        );
        const beforeWrap = angleOf();
        view.rerender(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={64} />
        );
        const afterWrap = angleOf();
        const degrees = (t: string | undefined) =>
            Number((t ?? '').replace('rotate(', '').replace('deg)', ''));
        expect(degrees(afterWrap)).toBeGreaterThan(degrees(beforeWrap));
        expect(degrees(afterWrap) - degrees(beforeWrap)).toBe(6);
    });

    it('dims the dial and badges pause instead of ticking while paused', () => {
        const view = renderMini({
            hasSession: true,
            isRunning: true,
            percentage: 50,
            secondsLeft: 125,
        });
        const angleOf = () => transformOf(view.container.querySelector('.timer-orbit'));
        view.rerender(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={124} />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        // Pause repeats the frozen value: the hand holds its detent (only
        // opacity flips via the styled rule, invisible to the snapshot).
        view.rerender(
            <MiniLogger
                {...baseProps}
                hasSession
                isRunning={false}
                percentage={50}
                secondsLeft={124}
            />
        );
        expect(angleOf()).toBe('rotate(6deg)');
        const svg = view.container.querySelector('svg.timer-svg');
        expect(svg).not.toBeNull();
        expect(classNameOf(svg)).toContain('is-paused');
        expect(view.container.querySelectorAll('.timer-paused-badge')).toHaveLength(1);
        // The time text itself stays rendered so the remaining time is never hidden.
        expect(all(view.container, 'text').length).toBeGreaterThan(0);
        // Resume continues from the frozen detent instead of jumping back.
        view.rerender(
            <MiniLogger {...baseProps} hasSession isRunning percentage={50} secondsLeft={123} />
        );
        expect(angleOf()).toBe('rotate(12deg)');
    });

    it('hides the second hand while idle', () => {
        const { container } = renderMini({
            hasSession: false,
            isRunning: false,
            percentage: 0,
        });
        expect(container.querySelector('.timer-orbit')).toBeNull();
    });

    it('sweeps a single highlight while confirming: one animated node, static ticks', () => {
        jest.useFakeTimers();
        try {
            const view = renderMini({ isConfirming: true, hasSession: true, isRunning: true });
            const { container } = view;
            // One rotating highlight instead of eighteen animated ticks.
            expect(container.querySelectorAll('.timer-confirm')).toHaveLength(1);
            // All 18 base ticks stay static: no per-tick animation delay.
            const lines = all(container, 'line');
            expect(lines.length).toBeGreaterThanOrEqual(18);
            lines.forEach((line) => {
                expect((line as SVGElement).style.animationDelay).toBe('');
            });
            // No second hand or pause badge while confirming.
            expect(container.querySelector('.timer-orbit')).toBeNull();
            expect(container.querySelector('.timer-paused-badge')).toBeNull();

            // Long-idle freeze: after ~60s the sweep pauses itself. The
            // transient prop changes the generated class (and its CSS rule).
            const before = classNameOf(container.querySelector('.timer-confirm'));
            act(() => {
                jest.advanceTimersByTime(60000);
            });
            const after = classNameOf(container.querySelector('.timer-confirm'));
            expect(after).not.toBe(before);
            expect(document.head.textContent).toContain('animation-play-state:paused');
        } finally {
            jest.useRealTimers();
        }
    });
});
