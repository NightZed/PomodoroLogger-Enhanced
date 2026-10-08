import * as React from 'react';
import ReactHotkeys, { IReactHotkeysProps, OnKeyFun } from 'react-hot-keys';

/**
 * The app's one entry point to `react-hot-keys`, so the workarounds below live
 * in a single place: every `ReactHotkeys` usage (Application, Timer, Kanban,
 * PomodoroSankey) imports this component instead.
 *
 * Why the extra prop: `react-hot-keys@3.0.0`, the version the dependabot bump
 * brought in, rewrote the component as a hook and remembers the shortcuts that
 * are currently "down" in a ref (`activeKeysRef`) so that the key-repeat
 * keydowns of a held key fire a binding only once. That ref is drained by the
 * library's keyup path -- which is dead code unless the caller passes an
 * `onKeyUp` prop: `handleKeyUp` returns early on `!onKeyUp`, and the
 * document-level `keyup` listener it needs is registered only when `onKeyUp`
 * is set. No call site in this app listens to keyup, so the ref kept every
 * shortcut it had ever fired and every later press of the same combination was
 * swallowed: each binding worked exactly ONCE per mount. That is what broke
 * Ctrl+Tab / Ctrl+Shift+Tab / Tab / F5 / ... after the 3.0.0 merge -- 2.7.1
 * cleared its `isKeyDown` flag on *any* keyup, so the regression only exists
 * with 3.x.
 *
 * Passing the no-op below is what keeps that path alive. It is a module-level
 * constant on purpose: the library re-registers its keyup listener whenever
 * the `onKeyUp` identity changes, and a fresh arrow per render would do that on
 * every render. A call site's own `onKeyUp`, if one is ever added, wins -- but
 * note the library's release detection is crude (it compares the whole shortcut
 * string against the list of currently pressed key names, so nothing ever
 * matches and it reports every shortcut as released on *any* keyup), so do not
 * rely on it for pair-down/pair-up semantics.
 *
 * The one visible behaviour this preserves is the 2.x one: a binding fires once
 * while the combination stays held (auto-repeat is swallowed) and fires again
 * on the next press, every time.
 *
 * --- Input / window-focus guards (see `guardFilter`) ------------------------
 *
 * hotkeys-js binds on `document` and its stock filter only inspects the
 * *current* `event.target`, which leaks in two ways. Both were reported
 * against the Timer's bare `tab` binding (switch focus/rest):
 *
 * 1. keyup after a focus move. Pressing Tab inside an editable element is
 *    filtered on keydown -- no binding, no preventDefault -- so the browser's
 *    default moves focus; the keyup then arrives at the NEW target (a button,
 *    the modal wrap div, `<body>`), passes the filter, and -- because the
 *    keydown never made it into the library's "already down" set -- fires the
 *    binding. That is how typing in the card editor (CardEditor is portaled
 *    outside the Timer page, so nothing else guarded it) switched modes.
 * 2. Alt+Tab residue. Switching INTO this window delivers the Tab keydown/keyup
 *    the OS could not consume, again typically with `<body>` as the target, so
 *    the binding fired for a keystroke the user aimed at the task switcher.
 *
 * Three guards, all here so every call site inherits them:
 *
 *  - keydown-only: reject `event.type === 'keyup'` in the hotkeys-js filter.
 *    Safe for the release path described above: hotkeys-js runs
 *    `clearModifier()` for every keyup OUTSIDE `dispatch()`, so `_downKeys` /
 *    `_mods` still drain when the filter rejects, and this wrapper's own keyup
 *    listener is a plain `document` listener that never goes through the
 *    filter. The library's "already down" bookkeeping still works exactly as
 *    the first paragraph describes.
 *  - editable target: the stock predicate (INPUT / SELECT / TEXTAREA /
 *    contentEditable), re-expressed once as `isEditableTarget` so that
 *    `Timer.handleNativeKeydown` can share it and the two sides agree on what
 *    "the user is typing" means (it now prevents Tab's default only there).
 *  - window-focus grace: for `WINDOW_FOCUS_GRACE_MS` after the window (re)gains
 *    focus, no binding fires. A human cannot follow an Alt+Tab with a keypress
 *    that fast, but OS residue arrives within milliseconds; the window `focus`
 *    event always precedes it.
 *
 * The `onKeyDown` wrapper is defence in depth: `hotkeys.filter` is a global
 * mutable on the hotkeys-js singleton, so the callback re-checks the event
 * type instead of trusting that the filter installed here is still in place.
 */
const releaseHotkeyState = () => undefined;

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
 * Is the event targeted at something the user types into?
 *
 * Shared with `Timer.handleNativeKeydown` so the hotkey filter and the native
 * Tab preventDefault cannot drift apart (see the guard list above). Same
 * predicate as react-hot-keys' stock `defaultFilter`: `document` and plain
 * elements pass, editable ones do not.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!target) {
        return false;
    }

    const element = target as { tagName?: string; isContentEditable?: boolean };
    return (
        element.isContentEditable === true ||
        element.tagName === 'INPUT' ||
        element.tagName === 'SELECT' ||
        element.tagName === 'TEXTAREA'
    );
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
 * Timer.tsx (which pulls in the monitor, the worker threads and
 * `@electron/remote` at module level).
 */
export function shouldPreventTabDefault(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' && event.which !== 9 && event.keyCode !== 9) {
        return false;
    }

    // Shift+Tab is not bound (hotkeys-js matches modifiers exactly), so it
    // keeps the browser's reverse focus navigation -- swallowing it would only
    // leave a dead key. The modified forms belong to other bindings (Ctrl+Tab
    // switches pages) or to no one.
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return false;
    }

    return !isEditableTarget(event.target || event.srcElement);
}

/**
 * The one filter handed to hotkeys-js -- it is a global on the library's
 * singleton, so every instance installs this same module-level function.
 * `true` lets the event through to the bindings: same polarity as the stock
 * filter it replaces.
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

    return true;
};

export const Hotkeys = (props: IReactHotkeysProps) => {
    // Memoised: react-hot-keys rebinds the shortcut whenever the `filter` or
    // `handleKeyDown` identity changes, so a fresh arrow per render would
    // unbind/rebind on every render (guardFilter itself is module-level and
    // already stable).
    const siteFilter = props.filter;
    const filter = React.useMemo(
        () =>
            siteFilter
                ? (event: KeyboardEvent) => guardFilter(event) && siteFilter(event)
                : guardFilter,
        [siteFilter]
    );

    const siteOnKeyDown = props.onKeyDown;
    const onKeyDown = React.useMemo<OnKeyFun | undefined>(
        () =>
            siteOnKeyDown
                ? (shortcut, event, handle) => {
                      // Defence in depth: never act on a keyup, even if the
                      // shared filter was replaced behind our back.
                      if (event.type !== 'keydown') {
                          return;
                      }

                      siteOnKeyDown(shortcut, event, handle);
                  }
                : undefined,
        [siteOnKeyDown]
    );

    return (
        <ReactHotkeys
            {...props}
            filter={filter}
            onKeyDown={onKeyDown}
            onKeyUp={props.onKeyUp || releaseHotkeyState}
        />
    );
};

export default Hotkeys;
