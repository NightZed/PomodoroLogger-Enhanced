import React, { act } from 'react';
import { render, within } from '@testing-library/react';
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

const buttons = (container: HTMLElement) => all(container, 'button') as HTMLButtonElement[];

/** Inline transform of the SVG second hand. */
const transformOf = (node: Element | null) => (node as HTMLElement | null)?.style.transform;

const renderMini = (props: Partial<typeof baseProps> = {}) =>
    render(<MiniLogger {...baseProps} {...props} />);

describe('MiniLogger two-row mini layout', () => {
    it('shows the task name next to the controls', () => {
        const { container } = renderMini();

        expect(within(container).getByText('MiniLogger regression test')).toBeTruthy();
        expect(buttons(container).length).toBeGreaterThan(0);
    });

    it('paints the inner disc differently for focus and rest', () => {
        const fillOf = (props: Partial<typeof baseProps>) => {
            const circles = all(renderMini(props).container, 'circle');
            expect(circles.length).toBeGreaterThan(0);
            return circles[0].getAttribute('fill');
        };

        const focusing = fillOf({});
        const resting = fillOf({ isFocusing: false });
        expect(focusing).toBeTruthy();
        expect(resting).toBeTruthy();
        expect(focusing).not.toBe(resting);
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
        const controls = (props: Partial<typeof baseProps>) => {
            const { container } = renderMini(props);
            const scope = within(container);
            return {
                switchMode: scope.queryByRole('button', { name: 'Switch Mode (Tab)' }) !== null,
                finish: scope.queryByRole('button', { name: 'Finish' }) !== null,
            };
        };

        expect(controls({ hasSession: true, percentage: 0 })).toEqual({
            switchMode: false,
            finish: true,
        });
        expect(controls({ hasSession: true, percentage: 3 })).toEqual({
            switchMode: false,
            finish: true,
        });
        expect(controls({ hasSession: false, percentage: 0 })).toEqual({
            switchMode: true,
            finish: false,
        });
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
        expect(rendered[2].getAttribute('aria-label')).toBe('Stop');
        expect(rendered[2].disabled).toBe(true);
        expect(rendered[3].getAttribute('aria-label')).toBe('Expand (F12)');
        expect(rendered[3].disabled).toBe(false);
    });

    it('exposes the timer state through the dial accessible name', () => {
        const stateLabel = (props: Partial<typeof baseProps>) => {
            const { container } = renderMini(props);
            // The antd icons are `role="img"` spans too, so narrow to the dial.
            const dial = container.querySelector('svg[role="img"]');
            expect(dial).not.toBeNull();
            return dial?.getAttribute('aria-label') ?? '';
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
        // The dial says it is paused instead of changing what it draws.
        expect(within(view.container).getByRole('img', { name: /Paused/ })).toBeTruthy();
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
