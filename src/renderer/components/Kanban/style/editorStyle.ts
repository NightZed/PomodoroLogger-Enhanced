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
 * Fade the editor dialog without scaling it, so its content does not appear to
 * grow as the modal opens. `will-change` is limited to the animation classes.
 */
export const EditorAnimation = createGlobalStyle`
    @keyframes cardEditorFadeIn {
        from {
            opacity: 0;
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
    .card-editor-fade-appear {
        will-change: opacity;
        animation-name: cardEditorFadeIn;
        animation-duration: 0.15s;
        animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
        /* Hold the start/end state between commits, like antd's own motion
           styles (theme initMotion sets animationFillMode: 'both'). */
        animation-fill-mode: both;
    }

    .card-editor-fade-leave {
        will-change: opacity;
        animation-name: cardEditorFadeOut;
        animation-duration: 0.15s;
        animation-timing-function: ease-in;
        /* Without fill-mode the panel is back at its base opacity (1) in the
           frame between the end of the 150ms leave animation and rc-motion
           removing the leave class + applying display:none. The dialog then
           blinks fully visible for a frame -- it reads as "reopened and
           instantly closed again". Keep the final opacity 0 until the panel is
           hidden. (Verified with per-frame computed styles in Chromium.) */
        animation-fill-mode: both;
    }
`;
