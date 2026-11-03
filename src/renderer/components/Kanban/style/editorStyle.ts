import styled, { createGlobalStyle } from 'styled-components';
import { thinScrollBar } from '../../../style/scrollbar';

export const EditorContainer = styled.div`
    .ant-form-item {
        margin-bottom: 8px;
    }

    textarea {
        ${thinScrollBar}
    }
`;

/**
 * Kanban dialog motion.
 *
 * Shared by every dialog in the Kanban feature (the card editor and the board
 * editor), hence it is mounted once at the app root in `Application.tsx`.
 *
 * The editor is shown and hidden in a single frame; only a 1ms "hold"
 * animation runs on the `-active` classes. That animation has no visible
 * effect, it exists because rc-motion advances its state machine (and releases
 * the wrap / starts the leave step) on `animationend`. Without it the dialog
 * gets stuck in `enter` and can never close.
 *
 * Why no fade: the app runs with software rendering by default
 * (`useHardwareAcceleration` is off out of the box). The dialog panel is a
 * 960px wide surface over the board; animating its opacity or transform makes
 * the software compositor redraw the whole window every frame. Measured on a
 * 2560x1410 window with the real board data: a 150ms fade stretched to ~500ms
 * of wall time and cost ~0.5s CPU per open (plus ~0.35s per close), while the
 * same open with the animation removed costs ~0.35s and ~0.2s. That is the
 * "fullscreen opens slower / uses more CPU than the Timer sider" report. The
 * mask was animated separately before as well; fading it is cheaper per frame
 * but still composites the full window, so it now appears with the panel.
 *
 * The animation must live on the `-enter-active`/`-leave-active` class, not on
 * `-enter`: rc-motion only attaches its animationend listener when it enters
 * the active step, so an animation that starts (and finishes) a frame earlier
 * is never observed. `animation-fill-mode: both` keeps the end state between
 * commits; without it on leave the panel is visible for a frame between the
 * end of the animation and rc-motion applying display:none (the "reopened and
 * instantly closed again" blink).
 */
export const EditorAnimation = createGlobalStyle`
    /* Constant state: no visual change, just an animationend for rc-motion. */
    @keyframes cardEditorHold {
        from {
            opacity: 1;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes cardEditorFadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }

    .card-editor-fade-enter,
    .card-editor-fade-appear,
    .card-editor-fade-leave,
    .card-editor-panel-enter,
    .card-editor-panel-appear,
    .card-editor-panel-leave {
        animation: none;
    }

    .card-editor-fade-enter-active,
    .card-editor-fade-appear-active,
    .card-editor-panel-enter-active,
    .card-editor-panel-appear-active {
        animation-name: cardEditorHold;
        animation-duration: 0.001s;
        animation-fill-mode: both;
    }

    .card-editor-fade-leave-active,
    .card-editor-panel-leave-active {
        animation-name: cardEditorFadeOut;
        animation-duration: 0.001s;
        animation-fill-mode: both;
    }
`;
