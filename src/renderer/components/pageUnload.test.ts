import {
    deriveWindowMode,
    planPageUnload,
    SHORT_UNLOAD_DELAY,
    TAB_UNLOAD_DELAY,
    WindowMode,
} from './pageUnload';

const on = (currentTab: string) => ({ currentTab, unloadOnCloseToTray: true });
const off = (currentTab: string) => ({ currentTab, unloadOnCloseToTray: false });

describe('deriveWindowMode', () => {
    it('maps the three store flags to the four modes', () => {
        expect(deriveWindowMode({ inTray: false, minimize: false, compact: false })).toBe('normal');
        expect(deriveWindowMode({ inTray: false, minimize: false, compact: true })).toBe('compact');
        expect(deriveWindowMode({ inTray: false, minimize: true, compact: false })).toBe('mini');
        expect(deriveWindowMode({ inTray: true, minimize: false, compact: false })).toBe('tray');
    });

    it('puts the tray ahead of the mini strip', () => {
        // Closing the 90px strip minimizes it: the store still says
        // `minimize: true`, but the window is off screen.
        expect(deriveWindowMode({ inTray: true, minimize: true, compact: false })).toBe('tray');
        // Defensive: the two flags are mutually exclusive in the reducer, but
        // the precedence must not depend on that.
        expect(deriveWindowMode({ inTray: false, minimize: true, compact: true })).toBe('mini');
        expect(deriveWindowMode({ inTray: true, minimize: true, compact: true })).toBe('tray');
    });
});

describe('planPageUnload', () => {
    const pages = ['kanban', 'history', 'setting'] as const;

    it('mounts only the active page in the reachable modes', () => {
        for (const mode of ['normal', 'compact'] as WindowMode[]) {
            for (const page of pages) {
                expect(planPageUnload(page, mode, on(page)).mounted).toBe(true);
                expect(planPageUnload(page, mode, on('timer')).mounted).toBe(false);
            }
        }
    });

    it('keeps the per-page grace while the window is reachable', () => {
        for (const page of pages) {
            expect(planPageUnload(page, 'normal', on('timer')).graceMs).toBe(
                TAB_UNLOAD_DELAY[page]
            );
            // Compacting must not shorten anything: the user is still working
            // in that window, and a remount there is a visible regression.
            expect(planPageUnload(page, 'compact', on('timer')).graceMs).toBe(
                TAB_UNLOAD_DELAY[page]
            );
        }
    });

    it('drops every other page after the short grace in the mini strip', () => {
        for (const page of pages) {
            const plan = planPageUnload(page, 'mini', on(page));
            expect(plan.mounted).toBe(false);
            expect(plan.graceMs).toBe(SHORT_UNLOAD_DELAY);
        }
    });

    it('applies the tray setting only to the tray mode', () => {
        for (const page of pages) {
            expect(planPageUnload(page, 'tray', on(page)).mounted).toBe(false);
            expect(planPageUnload(page, 'tray', on(page)).graceMs).toBe(SHORT_UNLOAD_DELAY);
            // Off means off: the pages keep their regular grace.
            expect(planPageUnload(page, 'tray', off(page)).graceMs).toBe(TAB_UNLOAD_DELAY[page]);
            // The mini strip is not covered by the setting -- its tab bar is
            // hidden, so the pages are unreachable regardless.
            expect(planPageUnload(page, 'mini', off(page)).graceMs).toBe(SHORT_UNLOAD_DELAY);
        }
    });
});
