/**
 * How the window is presented, shared between the renderer and the main
 * process because both sides have to agree on what a dialog may change.
 *
 * The four values are not independent flags: `minimize` and `compact` are
 * mutually exclusive in the store (see `setMinimize` / `setCompact` in
 * `Timer/action.ts`), and `tray` wins over both because a window that was
 * closed to the tray is not coming back for a while no matter which shape it
 * had. Closing the 90px mini strip, for instance, goes through the same close
 * path: the store still says `minimize: true`, but the user is not looking.
 *
 * `tray` is the CLOSE path only. A plain minimize (`Win+Down`, the caption
 * button) leaves `inTray` false and the pages on their normal schedule -- the
 * user is coming straight back and expects the page they left untouched.
 */
export type WindowMode = 'normal' | 'compact' | 'mini' | 'tray';

/**
 * What a feedback surface asks the main process to do about the window.
 *
 * `normal` resizes it to the standard 1440x960 (a mini strip or a compact
 * window cannot show the dialog); `focus` only brings it to the front and
 * leaves its size alone. Both recover it from the tray.
 */
export type WindowAttentionAction = 'normal' | 'focus';
