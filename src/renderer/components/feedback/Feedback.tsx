import * as React from 'react';
import { Checkbox, Icon, Modal, Popconfirm, message, notification } from 'antd';
import { FEEDBACK_MESSAGES } from './messages';
import {
    FEEDBACK_ICON_COLORS,
    FEEDBACK_ICONS,
    FEEDBACK_MODAL_CLASS,
    FEEDBACK_TEXT_CLASS,
    FEEDBACK_WIDTH,
    TOAST_DURATION,
    feedbackKindClass,
} from './tokens';
import {
    AlertOptions,
    ConfirmCheckboxOptions,
    ConfirmOptions,
    ConfirmPopoverProps,
    FeedbackKind,
    NoticeOptions,
    ToastOptions,
} from './type';

/**
 * The single entry point for every in-app notification.
 *
 * Three channels cover everything the app has to say, each with one fixed
 * behaviour (so callers never have to decide about position, lifetime or
 * styling again):
 *
 * - `toast`   transient receipt of an action, auto dismisses (top center);
 * - `notice`  persistent background status with optional actions (top right);
 * - `confirm` / `alert`  blocking decision / acknowledgement (centered, masked).
 *
 * `ConfirmPopover` is the in-place variant of `confirm`, for destructive
 * buttons that live next to the thing they delete.
 *
 * All copy of these surfaces is selectable: the antd overrides in
 * `theme/globalStyle.ts` restore `user-select: text` for them, and every text
 * node is wrapped in `FEEDBACK_TEXT_CLASS`.
 */

const kindIcon = (kind: FeedbackKind) => (
    <Icon type={FEEDBACK_ICONS[kind]} style={{ color: FEEDBACK_ICON_COLORS[kind] }} />
);

const dialogClassName = (kind?: FeedbackKind) =>
    [FEEDBACK_MODAL_CLASS, feedbackKindClass(kind)].filter(Boolean).join(' ');

/** Transient receipt of an action; auto dismisses. */
export const toast = ({
    content,
    kind = 'info',
    duration = TOAST_DURATION,
    key,
    onClose,
}: ToastOptions): void => {
    message.open({
        type: kind,
        content: <span className={FEEDBACK_TEXT_CLASS}>{content}</span>,
        icon: kindIcon(kind),
        duration,
        key,
        onClose,
    });
};

/** Persistent status of a background job. */
export const notice = ({
    title,
    description,
    kind = 'info',
    duration = 0,
    key,
    actions,
    placement = 'topRight',
    onClose,
}: NoticeOptions): void => {
    notification.open({
        key,
        message: title,
        description:
            description === undefined ? undefined : (
                <div className={FEEDBACK_TEXT_CLASS}>{description}</div>
            ),
        icon: kindIcon(kind),
        duration,
        btn: actions,
        placement,
        onClose,
    });
};

/** Closes a notice opened with the same key. */
export const closeNotice = (key: string): void => {
    notification.close(key);
};

/**
 * Confirm body: renders the optional "don't ask again" style check box, which
 * needs its own state (antd's confirm body is stateless).
 */
const ConfirmContent: React.FC<{
    content?: React.ReactNode;
    checkbox?: ConfirmCheckboxOptions;
}> = ({ content, checkbox }) => {
    const [checked, setChecked] = React.useState(checkbox?.checked ?? false);
    const onCheckboxChange = (e: { target: { checked: boolean } }) => {
        setChecked(e.target.checked);
        if (checkbox && checkbox.onChange) {
            checkbox.onChange(e.target.checked);
        }
    };

    return (
        <div className={FEEDBACK_TEXT_CLASS}>
            {content}
            {checkbox ? (
                <div style={{ marginTop: 12 }}>
                    <Checkbox checked={checked} onChange={onCheckboxChange}>
                        {checkbox.label}
                    </Checkbox>
                </div>
            ) : undefined}
        </div>
    );
};

/** Blocking decision with OK / Cancel. */
export const confirm = ({
    title,
    content,
    kind = 'info',
    okText = 'OK',
    cancelText = 'Cancel',
    checkbox,
    width = FEEDBACK_WIDTH,
    onOk,
    onCancel,
}: ConfirmOptions) => {
    return Modal.confirm({
        className: dialogClassName(kind),
        title,
        content: <ConfirmContent content={content} checkbox={checkbox} />,
        icon: kindIcon(kind),
        okText,
        cancelText,
        width,
        centered: true,
        maskClosable: false,
        onOk,
        onCancel,
    });
};

/** Blocking information with a single acknowledgement button. */
export const alert = ({
    title,
    content,
    kind = 'info',
    okText = 'OK',
    width = FEEDBACK_WIDTH,
    onOk,
}: AlertOptions) => {
    return Modal.info({
        className: dialogClassName(kind),
        title,
        content: <div className={FEEDBACK_TEXT_CLASS}>{content}</div>,
        icon: kindIcon(kind),
        okText,
        width,
        centered: true,
        maskClosable: false,
        onOk,
    });
};

/**
 * In-place confirmation (antd Popconfirm) with the shared wording and styling.
 * `ref` is forwarded so callers can open it programmatically, e.g. from a
 * context menu item (`ref.current.setVisible(true)`).
 */
export const ConfirmPopover = React.forwardRef<any, ConfirmPopoverProps>((props, ref) => {
    const {
        title = FEEDBACK_MESSAGES.confirm.defaultTitle,
        onConfirm,
        onCancel,
        okText = 'OK',
        cancelText = 'Cancel',
        placement = 'top',
        children,
    } = props;
    return (
        <Popconfirm
            ref={ref}
            title={<span className={FEEDBACK_TEXT_CLASS}>{title}</span>}
            okText={okText}
            cancelText={cancelText}
            placement={placement}
            onConfirm={onConfirm}
            onCancel={onCancel}
        >
            {children}
        </Popconfirm>
    );
});
ConfirmPopover.displayName = 'ConfirmPopover';
