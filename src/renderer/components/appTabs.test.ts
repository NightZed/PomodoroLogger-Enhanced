import { APP_TABS, nextTabKey, planTabChange } from './appTabs';

describe('app tabs', () => {
    it('keeps the pages in the order of the title bar', () => {
        expect(APP_TABS.map((tab) => tab.key)).toEqual(['timer', 'kanban', 'history', 'setting']);
    });

    it('keeps the Timer page mounted across page switches', () => {
        // The running session and its interval live there; a page switch must
        // not tear them down.
        const timer = APP_TABS.find((tab) => tab.key === 'timer');
        expect(timer?.forceRender).toBe(true);
        expect(APP_TABS.filter((tab) => tab.forceRender)).toHaveLength(1);
    });

    it('keeps the tour anchors on the two tabs the tour highlights', () => {
        expect(APP_TABS.find((tab) => tab.key === 'timer')?.tourKey).toBe('pomodoro-tab');
        expect(APP_TABS.find((tab) => tab.key === 'kanban')?.tourKey).toBe('kanban-tab');
    });

    describe('nextTabKey', () => {
        it('walks forward page by page', () => {
            expect(nextTabKey('timer', 1)).toBe('kanban');
            expect(nextTabKey('kanban', 1)).toBe('history');
            expect(nextTabKey('history', 1)).toBe('setting');
        });

        it('wraps back to the first page without passing through a blank one', () => {
            // Regression: 'setting' + Ctrl+Tab used to land on a removed
            // dev-only page ('analyser') that no tab pane rendered, so the first
            // press showed a blank tab and only the second reached the Timer.
            expect(nextTabKey('setting', 1)).toBe('timer');
        });

        it('walks backward and wraps around in the other direction', () => {
            expect(nextTabKey('timer', -1)).toBe('setting');
            expect(nextTabKey('kanban', -1)).toBe('timer');
        });

        it('is the inverse of itself', () => {
            for (const { key } of APP_TABS) {
                expect(nextTabKey(nextTabKey(key, 1), -1)).toBe(key);
                expect(nextTabKey(nextTabKey(key, -1), 1)).toBe(key);
            }
        });

        it('enters at the first page from a tab that is gone', () => {
            // `currentTab` is not only written by the tab bar, so it can name a
            // page the current build does not have -- 'analyser' below is the
            // dev-only page the rotation used to walk into before `TABS` was
            // removed. Neither direction may land on a blank tab.
            expect(nextTabKey('analyser', 1)).toBe('timer');
            expect(nextTabKey('analyser', -1)).toBe('timer');
        });
    });

    describe('planTabChange', () => {
        it('leaves compact mode for any other page, remembering it for the Timer', () => {
            expect(planTabChange('kanban', { compact: true, returnToCompact: false })).toEqual({
                tab: 'kanban',
                compact: false,
                returnToCompact: true,
            });
        });

        it('restores compact mode when the Timer page comes back', () => {
            expect(planTabChange('timer', { compact: false, returnToCompact: true })).toEqual({
                tab: 'timer',
                compact: true,
            });
        });

        it('does not restore compact mode the user never left in the first place', () => {
            expect(planTabChange('timer', { compact: false, returnToCompact: false })).toEqual({
                tab: 'timer',
            });
        });

        it('keeps the remembered compact mode while the window already is compact', () => {
            // Switching (or switching back) from within compact mode must not
            // clear the memory, otherwise F11 in compact mode would be the only
            // way back and the page switch would have dropped it silently.
            expect(planTabChange('history', { compact: true, returnToCompact: true })).toEqual({
                tab: 'history',
                compact: false,
                returnToCompact: true,
            });
        });

        it('touches neither window mode field when nothing has to change', () => {
            const plan = planTabChange('setting', { compact: false, returnToCompact: false });
            expect(plan.compact).toBeUndefined();
            expect(plan.returnToCompact).toBeUndefined();
        });

        it('never leaves the compact window on a page it is not sized for', () => {
            // setCompact(true) also forces currentTab back to 'timer' (see the
            // reducer), so compact mode and a non-Timer page must never be
            // planned together.
            for (const { key } of APP_TABS) {
                for (const compact of [true, false]) {
                    for (const returnToCompact of [true, false]) {
                        const plan = planTabChange(key, { compact, returnToCompact });
                        if (plan.tab !== 'timer') {
                            expect(plan.compact).not.toBe(true);
                        }
                    }
                }
            }
        });
    });
});
