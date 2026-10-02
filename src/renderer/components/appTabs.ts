import { tabType } from './Timer/action';

/**
 * The app's pages, in the order the title bar shows them.
 *
 * One list, three consumers: `AppTitleBar` renders one `TabPane` per entry,
 * `Application` walks it for Ctrl+Tab / Ctrl+Shift+Tab, and `planTabChange`
 * below owns what switching a page means for the window mode. The bar and the
 * hotkeys used to keep separate lists -- the bar's four panes and the `TABS`
 * constant of the timer actions, which a long removed dev-only page had left
 * one entry longer -- so in a dev build Ctrl+Tab walked into a page no pane
 * rendered: pressed on Setting it landed on a blank tab first and only reached
 * the Timer on the second press, while the arrow keys of the tab bar (rc-tabs
 * walks the rendered panes, see `getNextActiveKey`) went straight there.
 * Deriving both from this list is what keeps them from drifting apart again.
 */
export interface AppTabMeta {
    key: tabType;
    /** Shown next to the icon; compact mode keeps the icon only. */
    title: string;
    /** antd 3 icon type, the same set the settings navigation uses. */
    icon: string;
    /** `data-tour` hook of the guided tour, where there is one. */
    tourKey?: string;
    /**
     * Keep the page mounted while another tab is active. The Timer page owns the
     * running session and its interval, so a page switch must not tear it down.
     */
    forceRender: boolean;
}

export const APP_TABS: AppTabMeta[] = [
    {
        key: 'timer',
        title: 'Pomodoro',
        icon: 'clock-circle',
        tourKey: 'pomodoro-tab',
        forceRender: true,
    },
    {
        key: 'kanban',
        title: 'Kanban',
        icon: 'project',
        tourKey: 'kanban-tab',
        forceRender: false,
    },
    { key: 'history', title: 'History', icon: 'history', forceRender: false },
    { key: 'setting', title: 'Setting', icon: 'setting', forceRender: false },
];

/**
 * The tab `direction` steps away from `current`, wrapping around.
 *
 * `current` may be any value -- the tab bar is not the only writer of
 * `currentTab` (`setMinimize` and `setCompact` write it too) -- in which case
 * the first tab is the entry point.
 */
export function nextTabKey(current: string, direction: 1 | -1): tabType {
    const index = APP_TABS.findIndex((tab) => tab.key === current);
    if (index < 0) {
        return APP_TABS[0].key;
    }

    return APP_TABS[(index + direction + APP_TABS.length) % APP_TABS.length].key;
}

/** What a tab switch has to write besides the tab itself. */
export interface TabChangePlan {
    tab: tabType;
    /** New value of `TimerState.compact`, when the switch has to change it. */
    compact?: boolean;
    /** New value of `Application.returnToCompact`, when the switch has to change it. */
    returnToCompact?: boolean;
}

/**
 * What switching to `tab` means for the window mode.
 *
 * The compact window is sized for the Timer page only (`setCompact` in the
 * reducer even forces `currentTab` back to 'timer'), so leaving the Timer page
 * drops compact mode -- and `returnToCompact` remembers that the user was in
 * it, so coming back to the Timer page restores it. That memory is why the
 * caller has to hold `returnToCompact` across renders.
 *
 * Both the tab bar (clicks *and* its arrow-key navigation, see rc-tabs
 * `onNavKeyDown`) and the Ctrl+Tab / Ctrl+Shift+Tab hotkeys plan through here.
 * The hotkeys used to bypass this: they only rotated the tab id, which left the
 * small window showing a page it is not sized for, with F11 as the only way
 * back to the normal window.
 */
export function planTabChange(
    tab: tabType,
    state: { compact: boolean; returnToCompact: boolean }
): TabChangePlan {
    if (tab === 'timer') {
        if (state.returnToCompact && !state.compact) {
            return { tab, compact: true };
        }

        return { tab };
    }

    if (state.compact) {
        return { tab, compact: false, returnToCompact: true };
    }

    return { tab };
}
