import * as React from 'react';

/**
 * Semantic flavor of a feedback message.
 *
 * Every channel (`toast`, `notice`, `confirm`, `alert`) derives its icon and
 * accent color from this value, so the same situation always looks the same.
 */
export type FeedbackKind = 'info' | 'success' | 'warning' | 'error';

/**
 * Transient, non blocking receipt of a user action ("Start Focusing",
 * "Paused", "Cannot switch mode while a session is in progress").
 *
 * Auto dismisses, but stays long enough to be read, and its text can be
 * selected while it is on screen.
 */
export interface ToastOptions {
    content: React.ReactNode;
    /** Defaults to `info`. */
    kind?: FeedbackKind;
    /** Milliseconds on screen; defaults to `TOAST_DURATION`. */
    duration?: number;
    /** Reusing a key updates the existing toast instead of stacking a new one. */
    key?: string;
    onClose?: () => void;
}

/**
 * Persistent, closable status of a background job that may need a follow up
 * action ("Downloading Update", "Update Downloaded", "... needs restart").
 */
export interface NoticeOptions {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** Defaults to `info`. */
    kind?: FeedbackKind;
    /** Defaults to `0`: the notice stays until the user closes it. */
    duration?: number;
    /** Same key -> same slot; repeated updates never stack up. */
    key?: string;
    /** Rendered in the footer, e.g. a "Restart &amp; Install" button. */
    actions?: React.ReactNode;
    /** Defaults to `topRight`, where update news is already expected. */
    placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    onClose?: () => void;
}

/** Optional opt-out check box rendered above the confirm buttons. */
export interface ConfirmCheckboxOptions {
    label: React.ReactNode;
    /** Initial state; the box keeps track of itself afterwards. */
    checked?: boolean;
    onChange?: (checked: boolean) => void;
}

/** Blocking decision: keeps title, button order and wording consistent. */
export interface ConfirmOptions {
    title?: React.ReactNode;
    content?: React.ReactNode;
    /** Drives the icon (and its color). Defaults to `info`. */
    kind?: FeedbackKind;
    /** Defaults to `OK`. */
    okText?: string;
    /** Defaults to `Cancel`. */
    cancelText?: string;
    checkbox?: ConfirmCheckboxOptions;
    /** Defaults to `FEEDBACK_WIDTH`. */
    width?: number;
    onOk?: () => void;
    onCancel?: () => void;
}

/** Blocking information with a single acknowledgement button. */
export interface AlertOptions {
    title?: React.ReactNode;
    content?: React.ReactNode;
    /** Defaults to `info`. */
    kind?: FeedbackKind;
    /** Defaults to `OK`. */
    okText?: string;
    /** Defaults to `FEEDBACK_WIDTH`. */
    width?: number;
    onOk?: () => void;
}

/** Props of the shared in place confirmation popover. */
export interface ConfirmPopoverProps {
    title?: React.ReactNode;
    onConfirm?: (e?: React.MouseEvent) => void;
    onCancel?: (e?: React.MouseEvent) => void;
    okText?: string;
    cancelText?: string;
    placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
    children?: React.ReactNode;
}
