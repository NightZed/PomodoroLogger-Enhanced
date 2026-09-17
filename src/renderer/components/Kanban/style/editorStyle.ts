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
 * Custom Modal animation: cheap compositing-only zoom/fade (~150ms).
 * `will-change` is applied only on the enter/leave classes so the GPU layer
 * is created for the animation and released afterwards (nothing persists).
 */
export const EditorAnimation = createGlobalStyle`
    @keyframes cardEditorZoomIn {
        from {
            opacity: 0;
            transform: scale(0.98);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    @keyframes cardEditorZoomOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.98);
        }
    }

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

    .card-editor-zoom-enter,
    .card-editor-zoom-appear {
        will-change: transform, opacity;
        animation-name: cardEditorZoomIn;
        animation-duration: 0.15s;
        animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
    }

    .card-editor-zoom-leave {
        will-change: transform, opacity;
        animation-name: cardEditorZoomOut;
        animation-duration: 0.15s;
        animation-timing-function: ease-in;
    }

    .card-editor-fade-enter,
    .card-editor-fade-appear {
        animation-name: cardEditorFadeIn;
        animation-duration: 0.15s;
        animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
    }

    .card-editor-fade-leave {
        animation-name: cardEditorFadeOut;
        animation-duration: 0.15s;
        animation-timing-function: ease-in;
    }
`;
