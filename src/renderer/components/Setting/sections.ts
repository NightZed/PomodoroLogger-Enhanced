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
    /** Group title, shown in the navigation and as the pane heading. */
    title: string;
    /** antd 3 icon type, same set as the main tab bar. */
    icon: string;
}

export const SECTIONS: SectionMeta[] = [
    { id: 'timer', title: 'Timer', icon: 'clock-circle' },
    { id: 'appearance', title: 'Appearance', icon: 'skin' },
    { id: 'notification', title: 'Notifications', icon: 'bell' },
    { id: 'shortcuts', title: 'Shortcuts', icon: 'tags' },
    { id: 'system', title: 'System', icon: 'setting' },
    { id: 'about', title: 'About', icon: 'info-circle' },
];

export const DEFAULT_SECTION: SectionId = 'timer';

export interface ShortcutEntry {
    /** Key combination, as `react-hot-keys` spells it. */
    keys: string;
    /** What it does, in the wording of the screen it acts on. */
    description: string;
}

/**
 * The complete list of the app's shortcuts, read-only.
 *
 * Every binding is hard coded in the component that owns it (see the
 * `ReactHotkeys` / `Hotkeys` usages in Application.tsx, Timer.tsx and
 * Kanban.tsx), so this table is documentation only -- changing a key here would
 * not change the behaviour. It exists so the settings page can tell the user
 * what the keys do instead of leaving them to guess.
 */
export const SHORTCUTS: { group: string; entries: ShortcutEntry[] }[] = [
    {
        group: 'Navigation',
        entries: [
            { keys: 'Ctrl + Tab', description: 'Switch to the next tab' },
            { keys: 'Ctrl + Shift + Tab', description: 'Switch to the previous tab' },
        ],
    },
    {
        group: 'Window',
        entries: [
            { keys: 'F11', description: 'Toggle the compact (small window) mode' },
            { keys: 'F12', description: 'Toggle the mini mode' },
            { keys: 'Ctrl + Q', description: 'Quit the app' },
        ],
    },
    {
        group: 'Timer',
        entries: [
            { keys: 'F5', description: 'Start or resume the current session' },
            { keys: 'F6', description: 'Stop the current session' },
            { keys: 'Tab', description: 'Switch between focus and break' },
        ],
    },
    {
        group: 'Kanban',
        entries: [
            { keys: 'Ctrl + N', description: 'Create a new board' },
            { keys: 'Esc', description: 'Go back to the board list' },
        ],
    },
    {
        group: 'Editors',
        entries: [
            {
                keys: 'Ctrl + Enter',
                description: 'Save the card or board being edited',
            },
            { keys: 'Ctrl + F12', description: 'Open the developer tools' },
        ],
    },
];

/** Copy shared by the sections, kept next to the table above. */
export const SHORTCUT_DISCLAIMER =
    'These shortcuts are built into the app and cannot be changed yet.';
