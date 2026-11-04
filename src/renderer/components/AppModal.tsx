import * as React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import { createGlobalStyle } from 'styled-components';

/**
 * How every antd dialog in the app opens and closes.
 *
 * The app runs with software rendering by default (`useHardwareAcceleration`
 * is off out of the box). Animating a full-window mask or a large dialog makes
 * the compositor redraw the whole window every frame. Measured on a 2560x1410
 * window with real board data:
 *
 * - A 150ms panel fade stretched to ~500ms of wall time and cost ~0.5s CPU
 *   per open (plus ~0.35s per close).
 * - The antd click ripple that starts when a button opens the dialog runs for
 *   2s (~60fps) and cost another ~0.5s CPU per open.
 *
 * Removing both leaves only the one-time paint/composite of the dialog and the
 * mask. The ripple is disabled globally in `Application`; this module removes
 * the dialog motion. Both card and board editors use it, as do the feedback
 * confirm/alert dialogs and the distracting-app settings dialog.
 *
 * The 1ms "hold" animation on `-enter-active` exists only to fire
 * `animationend`: rc-motion advances its state machine on that event, and
 * without it the dialog stays in `enter` and can never close. The leave step
 * still runs a 1ms fade-out so the panel is not visible for a frame between
 * the end of the animation and rc-motion applying `display: none`.
 */
export const DIALOG_PANEL_TRANSITION = 'pl-dialog-panel';
export const DIALOG_MASK_TRANSITION = 'pl-dialog-mask';

/** Spread into imperative dialogs (`modal.confirm` / `modal.info`). */
export const dialogMotionProps = {
    transitionName: DIALOG_PANEL_TRANSITION,
    maskTransitionName: DIALOG_MASK_TRANSITION,
} as const;

export const DialogMotion = createGlobalStyle`
    /* Constant state: no visual change, just an animationend for rc-motion. */
    @keyframes plDialogHold {
        from {
            opacity: 1;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes plDialogFadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }

    .pl-dialog-panel-enter,
    .pl-dialog-panel-appear,
    .pl-dialog-panel-leave,
    .pl-dialog-mask-enter,
    .pl-dialog-mask-appear,
    .pl-dialog-mask-leave {
        animation: none;
    }

    .pl-dialog-panel-enter-active,
    .pl-dialog-panel-appear-active,
    .pl-dialog-mask-enter-active,
    .pl-dialog-mask-appear-active {
        animation-name: plDialogHold;
        animation-duration: 0.001s;
        animation-fill-mode: both;
    }

    .pl-dialog-panel-leave-active,
    .pl-dialog-mask-leave-active {
        animation-name: plDialogFadeOut;
        animation-duration: 0.001s;
        animation-fill-mode: both;
    }
`;

/**
 * Use this instead of antd's `Modal` so new dialogs get the shared motion
 * automatically. `forceRender` is intentionally not a default: only heavy
 * editors should keep their contents mounted while closed.
 */
export const AppModal: React.FC<ModalProps> = (props: ModalProps) => (
    <Modal {...dialogMotionProps} {...props} />
);
