import React from 'react';
import { render, within } from '@testing-library/react';
import { MiniLogger } from './MiniLogger';
import type { PomodoroRecord } from '../../../renderer/monitor/type';
import { t } from '../../../renderer/i18n';

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
    pomodorosToday: 3,
    stagedPomodoro: undefined as PomodoroRecord | undefined,
};

const all = (container: HTMLElement, selector: string) =>
    Array.from(container.querySelectorAll(selector));

const buttons = (container: HTMLElement) => all(container, 'button') as HTMLButtonElement[];

const renderMini = (props: Partial<typeof baseProps> = {}) =>
    render(<MiniLogger {...baseProps} {...props} />);

describe('MiniLogger mini strip', () => {
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

    it("appends today's count to the dial label", () => {
        const { container } = renderMini({ pomodorosToday: 7 });
        const dial = container.querySelector('svg[role="img"]');

        expect(dial?.getAttribute('aria-label')).toContain('🍅 7');
    });

    it('counts the just-finished session in the confirming label', () => {
        const { container } = renderMini({
            isConfirming: true,
            pomodorosToday: 3,
            stagedPomodoro: {
                _id: 'staged',
                apps: {},
                spentTimeInHour: 25 / 60,
                switchTimes: 0,
                startTime: 0,
            },
        });
        const dial = container.querySelector('svg[role="img"]');

        // Confirmation is what stores the session, so while the mask is up it
        // is still missing from `pomodorosToday`; the label has to add it to
        // agree with the mask's headline.
        expect(dial?.getAttribute('aria-label')).toBe(
            t('timer.stats.modeWithCount', t('timer.mini.finish'), 4)
        );
    });

    it('counts only the stored sessions when nothing is waiting', () => {
        const { container } = renderMini({ isConfirming: true, pomodorosToday: 3 });
        const dial = container.querySelector('svg[role="img"]');

        expect(dial?.getAttribute('aria-label')).toBe(
            t('timer.stats.modeWithCount', t('timer.mini.finish'), 3)
        );
    });
});
