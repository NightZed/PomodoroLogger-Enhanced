/**
 * Sizes shared by the History day editor, the board's unassigned panel and
 * every picker opened from them.
 *
 * The day editor is the widest of the group; the project, card and list
 * choosers reuse its width because they are only one click apart. A width jump
 * between two clicks reads as the window moving rather than as new content, and
 * a pixel assertion in a unit test cannot see that: it would only pin today's
 * number. Sharing the constant is what keeps them equal.
 */
export const DAY_EDITOR_WIDTH = 860;

/**
 * Fixed height of the content area: the toolbar (or a picker's search row),
 * the scrolling part, and the button row at the bottom. antd adds the title
 * and the 20px body padding on top of this.
 *
 * One number for all of them, because height was previously derived from two
 * different stacks: the editor's toolbar sat *outside* its 380px list, while a
 * picker's search row sat *inside* its own 380px body. Equal widths did not
 * help -- a day with enough sessions reached full height and the picker opened
 * one toolbar shorter, showing a band of the editor underneath. Matching the
 * two by hand would break again the next time a row height changed.
 *
 * So every one of these dialogs is now `<Body height=DIALOG_BODY_HEIGHT>` with
 * the scroll area on `flex: 1`: the editor's list comes out at 380 because its
 * toolbar and footer take the difference, and the pickers fill the rest with
 * their grid. The editor keeps this height at any row count -- a short day
 * leaves blank space below the list instead of a dialog that grows and shrinks
 * with the number of sessions.
 *
 * Do not assert this in a test: jsdom has no layout, so `466px` would only pin
 * today's design.
 */
export const DIALOG_BODY_HEIGHT = 466;
