import * as React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { isEditableTarget } from '../../shared/keyboard';
import { isModalOpen } from './popupLayer';

/**
 * The app's one entry point to `react-hotkeys-hook`, so the guards below live
 * in a single place: every hotkey usage (Application, Timer, Kanban,
 * PomodoroSankey) imports this component instead of the hook directly.
 *
 * `react-hotkeys-hook` matches shortcuts against `KeyboardEvent.key` when
 * `useKey` is enabled. That mirrors what the old hotkeys-js wrapper did (and
 * keeps the call sites' spelling, e.g. `esc`), while `esc` is the one name the
 * browser reports differently (`Escape`), so it is normalized on the way in
 * and mapped back on the way out.
 *
 * --- Input / window-focus guards -------------------------------------------
 *
 * A document-level keydown listener leaks in two ways. Both were reported
 * against the Timer's bare `tab` binding (switch focus/rest):
 *
 * 1. keyup after a focus move. Pressing Tab inside an editable element is
 *    filtered on keydown -- no binding, no `preventDefault` -- so the browser's
 *    default moves focus; the keyup then arrives at the NEW target (a button,
 *    the modal wrap div, `<body>`). The library's default keydown trigger
 *    avoids acting on that keyup, but the bound callback still needs the same
 *    editable-target rule as the keydown.
 * 2. Alt+Tab residue. Switching INTO this window delivers the Tab keydown/keyup
 *    the OS could not consume, again typically with `<body>` as the target, so
 *    the binding would fire for a keystroke the user aimed at the task
 *    switcher.
 *
 * Four guards, all here so every call site inherits them:
 *
 *  - keydown-only: the hook is configured with `keydown: true` and
 *    `keyup: false`, and the callback re-checks the event type.
 *  - editable target: the hook disables form tags/contentEditable, and
 *    `guardFilter` repeats the same predicate via `isEditableTarget` from
 *    `src/shared/keyboard.ts` -- the one wording shared with
 *    `Timer.handleNativeKeydown` and the Search bar's Ctrl+F listener.
 *  - window-focus grace: for `WINDOW_FOCUS_GRACE_MS` after the window (re)gains
 *    focus, no binding fires. A human cannot follow an Alt+Tab with a keypress
 *    that fast, but OS residue arrives within milliseconds; the window `focus`
 *    event always precedes it.
 *  - modal gate: while an antd dialog is open (`isModalOpen` in popupLayer.ts)
 *    no binding fires except Ctrl+F12 (dev tools -- a separate window, and
 *    documented in the shortcut table). A dialog owns the keyboard: F12 would
 *    minimise the window and unmount the card editor with its unsaved fields,
 *    Ctrl+Q would quit, Ctrl+Tab would turn the page underneath -- all from a
 *    press aimed at the dialog. Nothing needed while an overlay is up is lost:
 *    rc-dialog handles Esc/Enter itself (it stops propagation), the ending
 *    mask and the Sankey fullscreen are plain divs rather than modals, and the
 *    Search bar / card editor keep their own document listeners.
 *
 * The repeated-key guard is separate: `react-hotkeys-hook` calls the callback
 * on every keydown, including auto-repeats. The old wrapper fired once while a
 * combination stayed held and again on the next press. We keep that by
 * remembering the pressed shortcuts and dropping repeats until keyup; the
 * `event.repeat` check is a belt-and-braces guard for OS-generated repeats.
 *
 * Everything here is per mounted component: Kanban's Esc and the Sankey
 * overlay's Esc can both match the same press, exactly as before.
 */

/**
 * How long after the window (re)gains focus the bindings stay silent. 300ms is
 * far beyond the milliseconds Alt+Tab residue needs to arrive, and far below
 * any deliberate follow-up press a human can produce.
 */
export const WINDOW_FOCUS_GRACE_MS = 300;

/**
 * Timestamp of the last window `focus`, `-Infinity` until the first one so the
 * bindings work normally right after the renderer starts. Module-level on
 * purpose: this is a window property, not a component one, and every mounted
 * `Hotkeys` must observe the same value.
 */
let windowFocusedAt = -Infinity;

if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
        windowFocusedAt = Date.now();
    });
}

/**
 * Should the native keydown listener behind the Timer page's layout swallow
 * Tab's default action (moving focus)?
 *
 * The page's bare `tab` binding owns Tab only when the press is unmodified and
 * the user is not typing -- exactly the cases where the binding can fire (see
 * `guardFilter`), so the preventDefault and the hotkey can never disagree.
 * Everywhere else Tab keeps its native navigation; a blanket preventDefault
 * (what this used to be) turned every input on the page into a dead key.
 *
 * Exported as a pure predicate so `Timer.handleNativeKeydown` stays a
 * one-liner and `Hotkeys.test.tsx` can pin the rule down without importing
 * Timer.tsx (which pulls in the monitor, the worker threads and the preload
 * bridge at module level).
 */
export function shouldPreventTabDefault(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' && event.which !== 9 && event.keyCode !== 9) {
        return false;
    }

    // Shift+Tab is not bound (the hook matches modifiers exactly), so it keeps
    // the browser's reverse focus navigation -- swallowing it would only leave
    // a dead key. The modified forms belong to other bindings (Ctrl+Tab
    // switches pages) or to no one.
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return false;
    }

    return !isEditableTarget(event.target || event.srcElement);
}

/**
 * Ctrl+F12 / Cmd+F12 (open the developer tools): the one press the modal
 * gate lets through -- documented in the settings shortcut table, opens a
 * separate window and touches no page state, so a dialog need not swallow it.
 */
const isDevToolsToggle = (event: KeyboardEvent): boolean =>
    (event.ctrlKey || event.metaKey) && (event.key === 'F12' || event.keyCode === 123);

/**
 * The filter behind `ignoreEventWhen`. Returning `true` makes the hook ignore
 * the event entirely (and, importantly, leaves its default action alone).
 */
const guardFilter = (event: KeyboardEvent): boolean => {
    // keydown-only: see guard #1. The keyup cases this blocks (focus moved away
    // from the editable element; Alt+Tab residue) are exactly the ones the
    // stock filter let through.
    if (event.type === 'keyup') {
        return false;
    }

    // Stock behaviour: never treat typing as a shortcut press.
    const target = event.target || event.srcElement;
    if (isEditableTarget(target)) {
        return false;
    }

    // Window-focus grace: see guard #3.
    if (Date.now() - windowFocusedAt < WINDOW_FOCUS_GRACE_MS) {
        return false;
    }

    // Modal gate: see guard #4. A blocked key never reaches a handler, and the
    // hook only preventDefaults when the handler maps say so -- so the dialog
    // keeps the browser's default Tab navigation for free.
    if (isModalOpen() && !isDevToolsToggle(event)) {
        return false;
    }

    return true;
};

/** `esc` is the only spelling the library's `KeyboardEvent.key` path differs on. */
const normalizeKeyName = (keyName: string): string =>
    keyName
        .split(',')
        .map((shortcut) =>
            shortcut
                .trim()
                .split('+')
                .map((part) => (part.toLowerCase() === 'esc' ? 'escape' : part))
                .join('+')
        )
        .join(',');

/** Map the library's normalized `escape` back to the call site's `esc`. */
const toSiteKeyName = (hotkey: string): string =>
    hotkey
        .split('+')
        .map((part) => (part === 'escape' ? 'esc' : part))
        .join('+');

export type HotkeyHandler = (
    keyname: string,
    event: KeyboardEvent,
    handler: { hotkey: string }
) => void;

export interface HotkeysProps {
    keyName: string;
    onKeyDown: HotkeyHandler;
    /** Extra call-site filter, composed after the shared guards. */
    filter?: (event: KeyboardEvent) => boolean;
}

export const Hotkeys = (props: HotkeysProps) => {
    const siteFilter = props.filter;
    const onKeyDown = props.onKeyDown;
    const onKeyDownRef = React.useRef(onKeyDown);
    onKeyDownRef.current = onKeyDown;

    const normalizedKeyName = React.useMemo(() => normalizeKeyName(props.keyName), [props.keyName]);
    const pressed = React.useRef(new Set<string>());

    // Any keyup ends the current press, even if the modifier was released
    // first (in which case the library never sees a matching keyup). A window
    // blur gets the same treatment so a focus loss cannot leave a shortcut
    // stuck down.
    React.useEffect(() => {
        const release = () => pressed.current.clear();
        document.addEventListener('keyup', release, true);
        window.addEventListener('blur', release);
        return () => {
            document.removeEventListener('keyup', release, true);
            window.removeEventListener('blur', release);
        };
    }, []);

    const ignoreEventWhen = React.useCallback(
        (event: KeyboardEvent) => !guardFilter(event) || (siteFilter ? !siteFilter(event) : false),
        [siteFilter]
    );

    useHotkeys(
        normalizedKeyName,
        (event, handler) => {
            // Defence in depth: never act on a keyup or an OS repeat, even if
            // the hook's options are changed behind our back.
            if (event.type !== 'keydown' || event.repeat) {
                return;
            }

            const siteKeyName = toSiteKeyName(handler.hotkey);
            if (pressed.current.has(siteKeyName)) {
                return;
            }

            pressed.current.add(siteKeyName);
            onKeyDownRef.current(siteKeyName, event, handler);
        },
        {
            enabled: true,
            keydown: true,
            keyup: false,
            enableOnFormTags: false,
            enableOnContentEditable: false,
            preventDefault: false,
            useKey: true,
            ignoreEventWhen,
        },
        [normalizedKeyName, ignoreEventWhen]
    );

    return null;
};

export default Hotkeys;
