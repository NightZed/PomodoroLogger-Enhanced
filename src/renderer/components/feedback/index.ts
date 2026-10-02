import { alert, closeNotice, confirm, notice, toast } from './Feedback';

export { FEEDBACK_MESSAGES } from './messages';
export { ConfirmPopover } from './Feedback';
export type {
    AlertOptions,
    ConfirmCheckboxOptions,
    ConfirmOptions,
    ConfirmPopoverProps,
    FeedbackKind,
    NoticeOptions,
    ToastOptions,
} from './type';

/**
 * Grouped export, so call sites read as `feedback.toast(...)`.
 *
 * ```ts
 * import { feedback } from '../feedback';
 *
 * feedback.toast({ kind: 'success', content: 'Start Focusing' });
 * feedback.notice({ key: 'update-progress', title: 'Downloading Update', description: '42%' });
 * feedback.confirm({ kind: 'warning', title: 'Sure to delete?', onOk: remove });
 * ```
 *
 * - `toast`   transient receipt of an action, auto dismisses (top center)
 * - `notice`  persistent background status with optional actions (top right)
 * - `confirm` / `alert`  blocking decision / acknowledgement (centered, masked)
 * - `closeNotice(key)`  closes a notice opened with the same key
 *
 * Prefer this layer over importing `message` / `notification` from antd
 * directly (enforced by `no-restricted-imports` in `eslint.config.js`): it is
 * what keeps position, lifetime, styling and copy consistent.
 */
export const feedback = { alert, closeNotice, confirm, notice, toast };
