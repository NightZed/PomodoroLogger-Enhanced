import * as React from 'react';
import ReactHotkeys, { IReactHotkeysProps } from 'react-hot-keys';

/**
 * The app's one entry point to `react-hot-keys`, so the workaround below lives
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
 */
const releaseHotkeyState = () => undefined;

export const Hotkeys = (props: IReactHotkeysProps) => (
    <ReactHotkeys {...props} onKeyUp={props.onKeyUp || releaseHotkeyState} />
);

export default Hotkeys;
