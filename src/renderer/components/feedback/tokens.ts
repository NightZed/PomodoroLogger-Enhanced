import { FeedbackKind } from './type';

/**
 * Feedback layer tokens.
 *
 * The feedback channels share one visual language: the same surfaces
 * (`--pl-bg-elevated` / `--pl-border` / `--pl-shadow`), the same 8px radius, the
 * same typography and one icon per kind. The values live here (and in the
 * matching rules of `theme/globalStyle.ts`) so that looks cannot drift apart:
 * `theme/tokens.ts` stays about colors, this file stays about feedback.
 */

/** antd 3 icon name per kind. */
export const FEEDBACK_ICONS: { [K in FeedbackKind]: string } = {
    info: 'info-circle',
    success: 'check-circle',
    warning: 'exclamation-circle',
    error: 'close-circle',
};

/**
 * Icon color per kind. Neutral kinds read the active theme, while
 * warning/error keep antd's semantic colors so they stay recognizable in both
 * the day and the night theme.
 */
export const FEEDBACK_ICON_COLORS: { [K in FeedbackKind]: string } = {
    info: 'var(--pl-primary)',
    success: 'var(--pl-accent)',
    warning: '#faad14',
    error: '#ff4d4f',
};

/**
 * How long a toast stays on screen, in SECONDS.
 *
 * antd 3 / rc-notification interpret `duration` as seconds (`duration * 1000` is
 * the timeout), and `0` means "stays until closed". Longer than antd's 3s default
 * on purpose: the text is meant to be readable (and selectable) without racing a
 * timer.
 */
export const TOAST_DURATION = 2;

/**
 * Width of confirm/alert dialogs: narrower than antd's 520px default so the
 * 400px compact window still shows them with a margin.
 */
export const FEEDBACK_WIDTH = 380;

/**
 * Class names shared with `theme/globalStyle.ts`. `FEEDBACK_TEXT_CLASS` marks
 * selectable copy, `FEEDBACK_MODAL_CLASS` the dialogs of this layer.
 */
export const FEEDBACK_TEXT_CLASS = 'pl-feedback-text';
export const FEEDBACK_MODAL_CLASS = 'pl-feedback-modal';

/** Builds the `pl-feedback-<kind>` marker class of a dialog. */
export function feedbackKindClass(kind?: FeedbackKind): string | undefined {
    return kind === undefined ? undefined : `pl-feedback-${kind}`;
}
