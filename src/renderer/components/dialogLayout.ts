/**
 * Sizes shared by the History day editor and the dialogs opened from it.
 *
 * The day editor is the widest of the group; the project, card and list
 * choosers reuse its width because they are only one click apart. A width jump
 * between two clicks reads as the window moving rather than as new content, and
 * a pixel assertion in a unit test cannot see that: it would only pin today's
 * number. Sharing the constant is what keeps them equal.
 *
 * `PICKER_BODY_HEIGHT` is content height only; antd adds the header and footer.
 * The project and card pickers share it and both carry a footer, so their total
 * height matches as well.
 */
export const DAY_EDITOR_WIDTH = 860;

export const PICKER_BODY_HEIGHT = 380;
