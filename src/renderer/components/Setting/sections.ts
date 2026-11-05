import type { PlainMessageKey } from '../../../shared/i18n';

/**
 * Settings page sections.
 *
 * The page used to be one long scrolling list, which made a single option hard
 * to find among unrelated ones. It is now split into these groups, listed here
 * so the navigation and the panes stay in one place (and in the same order).
 */
export type SectionId = 'timer' | 'appearance' | 'notification' | 'shortcuts' | 'system' | 'about';

export interface SectionMeta {
    id: SectionId;
    /** Dictionary key of the group title, see `settings.sections.*`. */
    titleKey: PlainMessageKey;
    /** antd 3 icon type, same set as the main tab bar. */
    icon: string;
}

export const SECTIONS: SectionMeta[] = [
    { id: 'timer', titleKey: 'settings.sections.timer', icon: 'clock-circle' },
    { id: 'appearance', titleKey: 'settings.sections.appearance', icon: 'skin' },
    { id: 'notification', titleKey: 'settings.sections.notification', icon: 'bell' },
    { id: 'shortcuts', titleKey: 'settings.sections.shortcuts', icon: 'tags' },
    { id: 'system', titleKey: 'settings.sections.system', icon: 'setting' },
    { id: 'about', titleKey: 'settings.sections.about', icon: 'info-circle' },
];

export const DEFAULT_SECTION: SectionId = 'timer';

export interface ShortcutEntry {
    /** Key combination, as the shared `Hotkeys` wrapper spells it. */
    keys: string;
    /** Dictionary key of what the shortcut does. */
    descriptionKey: PlainMessageKey;
}

/**
 * The complete list of the app's shortcuts, read-only.
 *
 * Every binding is hard coded in the component that owns it (see the `Hotkeys`
 * usages in Application.tsx, Timer.tsx, Kanban.tsx and PomodoroSankey.tsx,
 * which all go through the shared wrapper in
 * src/renderer/components/Hotkeys.tsx), so this table is
 * documentation only -- changing a key here would not change the behaviour. It
 * exists so the settings page can tell the user what the keys do instead of
 * leaving them to guess.
 *
 * Only the descriptions are translated; `keys` are literal key names.
 */
export const SHORTCUTS: { groupKey: PlainMessageKey; entries: ShortcutEntry[] }[] = [
    {
        groupKey: 'settings.shortcuts.group.navigation',
        entries: [
            { keys: 'Ctrl + Tab', descriptionKey: 'settings.shortcuts.nextTab' },
            { keys: 'Ctrl + Shift + Tab', descriptionKey: 'settings.shortcuts.previousTab' },
        ],
    },
    {
        groupKey: 'settings.shortcuts.group.window',
        entries: [
            { keys: 'F11', descriptionKey: 'settings.shortcuts.toggleCompact' },
            { keys: 'F12', descriptionKey: 'settings.shortcuts.toggleMini' },
            { keys: 'Ctrl + Q', descriptionKey: 'settings.shortcuts.quit' },
        ],
    },
    {
        groupKey: 'settings.shortcuts.group.timer',
        entries: [
            { keys: 'F5', descriptionKey: 'settings.shortcuts.startSession' },
            { keys: 'F6', descriptionKey: 'settings.shortcuts.pauseSession' },
            { keys: 'Tab', descriptionKey: 'settings.shortcuts.switchMode' },
        ],
    },
    {
        groupKey: 'settings.shortcuts.group.kanban',
        entries: [
            { keys: 'Ctrl + N', descriptionKey: 'settings.shortcuts.newBoard' },
            { keys: 'Esc', descriptionKey: 'settings.shortcuts.backToBoardList' },
            { keys: 'Ctrl + F', descriptionKey: 'settings.shortcuts.searchCards' },
        ],
    },
    {
        groupKey: 'settings.shortcuts.group.editors',
        entries: [
            { keys: 'Ctrl + Enter', descriptionKey: 'settings.shortcuts.saveEditor' },
            { keys: 'Ctrl + F12', descriptionKey: 'settings.shortcuts.devTools' },
        ],
    },
    {
        groupKey: 'settings.shortcuts.group.statistics',
        entries: [{ keys: 'Esc', descriptionKey: 'settings.shortcuts.closeDiagram' }],
    },
];
