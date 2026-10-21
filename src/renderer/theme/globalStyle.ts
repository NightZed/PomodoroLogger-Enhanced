import { createGlobalStyle } from 'styled-components';
import { APP_FONT_FAMILY } from './tokens';

/**
 * Global (document level) theme layer.
 *
 * Our own components read the `--pl-*` custom properties written by
 * `applyTheme()`, so they follow the active theme automatically. Ant Design
 * receives the same tokens through ConfigProvider; these overrides cover the
 * remaining app-specific surfaces and win over generated component styles.
 *
 * Only neutral surfaces (background / border / text) are overridden: brand
 * colored buttons keep antd's blue so actions stay recognizable.
 */
export const GlobalStyle = createGlobalStyle`
    /* Fallback so the very first frame already matches the default (night) theme. */
    :root {
        --pl-theme-bg-opacity: 100%;
        --pl-bg: #141414;
        --pl-bg-elevated: #1f1f1f;
        --pl-bg-sunken: #262626;
        --pl-bg-hover: rgba(255, 255, 255, 0.08);
        --pl-text: rgba(255, 255, 255, 0.75);
        --pl-text-secondary: rgba(255, 255, 255, 0.55);
        --pl-text-tertiary: rgba(255, 255, 255, 0.35);
        --pl-border: #303030;
        --pl-primary: #177ddc;
        --pl-accent: #49aa19;
        --pl-shadow: rgba(0, 0, 0, 0.45);
        --pl-scrollbar-thumb: rgba(255, 255, 255, 0.25);
        --pl-scrollbar-track: rgba(255, 255, 255, 0.04);
        --pl-mask: rgba(0, 0, 0, 0.65);
    }

    html[data-theme='light'] {
        --pl-scrollbar-thumb: rgba(50, 50, 50, 0.3);
        --pl-scrollbar-track: rgba(0, 0, 0, 0.03);
        --pl-mask: rgba(0, 0, 0, 0.45);
    }

    html,
    body {
        background-color: transparent;
        color: var(--pl-text);
        font-family: ${APP_FONT_FAMILY};
    }

    /* Keep the document transparent for the frameless window; !important makes
       this rule win over component styles regardless of injection order. */
    html[data-theme] body {
        background-color: transparent !important;
        color: var(--pl-text) !important;
        font-family: ${APP_FONT_FAMILY} !important;
        transition: background-color 0.2s, color 0.2s;
    }

    ::selection {
        background-color: var(--pl-primary);
        color: #fff;
    }

    /* ---------- scrollbars ---------- */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: var(--pl-bg);
    }
    ::-webkit-scrollbar-thumb {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-thumb);
    }
    ::-webkit-scrollbar-track {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-track);
    }

    html[data-theme] .ant-select-dropdown .rc-virtual-list-holder::-webkit-scrollbar {
        width: 6px;
    }

    html[data-theme] .ant-select-dropdown .rc-virtual-list-scrollbar-vertical {
        width: 6px !important;
    }

    html[data-theme] .ant-select-dropdown .rc-virtual-list-holder-inner {
        padding-inline-end: 6px;
    }

    html[data-theme='dark'] {
        /* Give headings and paragraphs the theme color explicitly: body color
           inheritance must not depend on the antd/stylesheet order anywhere. */
        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        p,
        label {
            color: var(--pl-text);
        }

        /* ---------- tabs ---------- */
        .ant-tabs,
        .ant-tabs-content {
            color: var(--pl-text);
        }
        .ant-tabs-nav {
            /* Transparent on purpose: the window background layer paints this
               band (see Application.tsx and AppTitleBar.tsx), so painting it
               here as well would apply the background opacity a second time on
               top of the band. */
            background-color: transparent;
            border-bottom-color: var(--pl-border);
        }
        .ant-tabs-nav::before {
            border-bottom-color: var(--pl-border);
        }
        .ant-tabs-nav .ant-tabs-tab {
            color: var(--pl-text-secondary);
        }
        .ant-tabs-nav .ant-tabs-tab:hover,
        .ant-tabs-nav .ant-tabs-tab-active {
            color: var(--pl-primary);
        }
        /* card type tabs (the Edit/Preview switch in the board and card
           editors) ship a white background with a higher specificity than the
           generic tab rules above */
        .ant-tabs.ant-tabs-card > .ant-tabs-nav .ant-tabs-tab {
            background-color: var(--pl-bg-sunken);
            border-color: var(--pl-border);
            color: var(--pl-text-secondary);
        }
        .ant-tabs.ant-tabs-card > .ant-tabs-nav .ant-tabs-tab:hover {
            color: var(--pl-primary);
        }
        .ant-tabs.ant-tabs-card > .ant-tabs-nav .ant-tabs-tab-active {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-primary);
            color: var(--pl-primary);
        }

        /* ---------- buttons: neutral ones only ---------- */
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):not(.ant-btn-link):not(.ant-btn-text):not(.ant-btn-variant-text):not(.ant-btn-variant-link) {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):not(.ant-btn-link):not(.ant-btn-text):not(.ant-btn-variant-text):not(.ant-btn-variant-link):hover,
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):not(.ant-btn-link):not(.ant-btn-text):not(.ant-btn-variant-text):not(.ant-btn-variant-link):focus {
            background-color: var(--pl-bg-hover);
            border-color: var(--pl-primary);
            color: var(--pl-primary);
        }
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):not(.ant-btn-link):not(.ant-btn-text):not(.ant-btn-variant-text):not(.ant-btn-variant-link)[disabled],
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-dangerous):not(.ant-btn-link):not(.ant-btn-text):not(.ant-btn-variant-text):not(.ant-btn-variant-link)[disabled]:hover {
            background-color: var(--pl-bg-sunken);
            border-color: var(--pl-border);
            color: var(--pl-text-tertiary);
        }
        .ant-btn-link {
            color: var(--pl-primary);
        }

        /* ---------- cards ---------- */
        .ant-card {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-card-head {
            background-color: transparent;
            border-bottom-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-card-bordered {
            border-color: var(--pl-border);
        }
        .ant-card-actions {
            background-color: transparent;
            border-top-color: var(--pl-border);
        }
        .ant-card-actions > li {
            color: var(--pl-text-secondary);
        }
        .ant-card-actions > li:not(:last-child) {
            border-right-color: var(--pl-border);
        }

        /* ---------- table ---------- */
        .ant-table,
        .ant-table-wrapper {
            color: var(--pl-text);
        }
        .ant-table-thead > tr > th {
            background-color: var(--pl-bg-sunken);
            border-bottom-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-table-tbody > tr > td {
            border-bottom-color: var(--pl-border);
        }
        /* v6: hover is painted on the cells themselves
           (.ant-table-cell-row-hover, set by JS alongside tr:hover), not on
           the row. Keep guarding expanded/selected rows out like antd does. */
        .ant-table-tbody > tr:not(.ant-table-expanded-row):not(.ant-table-row-selected) > td.ant-table-cell-row-hover,
        .ant-table-tbody > tr:hover:not(.ant-table-expanded-row):not(.ant-table-row-selected) > td,
        .ant-table-thead > tr:not(.ant-table-expanded-row):not(.ant-table-row-selected) > th.ant-table-cell-row-hover,
        .ant-table-thead > tr:hover:not(.ant-table-expanded-row):not(.ant-table-row-selected) > th {
            background-color: var(--pl-bg-hover);
        }
        .ant-table-placeholder,
        .ant-table-expanded-row,
        .ant-table-expanded-row:hover {
            background-color: var(--pl-bg-elevated);
        }
        .ant-table-placeholder {
            border-bottom-color: var(--pl-border);
            color: var(--pl-text-secondary);
        }
        .ant-table-bordered .ant-table-header > table,
        .ant-table-bordered .ant-table-body > table,
        .ant-table-bordered.ant-table-empty .ant-table-placeholder {
            border-color: var(--pl-border);
        }

        /* ---------- modal ----------
           v6: the surface wrapper was renamed '.ant-modal-content' ->
           '.ant-modal-container' (header/body/footer/title/close unchanged). */
        .ant-modal-container {
            background-color: var(--pl-bg-elevated);
            color: var(--pl-text);
        }
        .ant-modal-header {
            background-color: transparent;
            border-bottom-color: var(--pl-border);
        }
        .ant-modal-title {
            color: var(--pl-text);
        }
        .ant-modal-footer {
            border-top-color: var(--pl-border);
        }
        .ant-modal-close,
        .ant-modal-close-x {
            color: var(--pl-text-secondary);
        }
        .ant-modal-close:hover {
            color: var(--pl-text);
        }
        .ant-modal-mask {
            background-color: var(--pl-mask);
        }

        /* ---------- popover / popconfirm ----------
           v6: '.ant-popover-inner' -> '.ant-popover-container',
           '.ant-popover-inner-content' -> '.ant-popover-content',
           popconfirm message rows moved to '.ant-popconfirm-message(-title)'. */
        .ant-popover-container {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 2px 8px var(--pl-shadow);
        }
        .ant-popover-title {
            border-bottom-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-popover-content,
        .ant-popconfirm-message,
        .ant-popconfirm-title {
            color: var(--pl-text);
        }
        /* ---------- tooltip ---------- */
        .ant-tooltip-inner {
            background-color: #434343;
            color: var(--pl-text);
        }
        .ant-tooltip-arrow::before {
            background-color: #434343;
        }

        /* ---------- dropdown / menu ---------- */
        .ant-dropdown-menu,
        .ant-menu {
            background-color: var(--pl-bg-elevated);
            color: var(--pl-text);
        }
        .ant-dropdown-menu-item,
        .ant-menu-item,
        .ant-menu-submenu-title {
            color: var(--pl-text);
        }
        .ant-dropdown-menu-item:hover,
        .ant-menu-item:hover,
        .ant-menu-submenu-title:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-dropdown-menu-item-divider,
        .ant-menu-item-divider {
            background-color: var(--pl-border);
        }
        .ant-menu-submenu-inline > .ant-menu-submenu-title:hover .ant-menu-submenu-arrow::before,
        .ant-menu-submenu-inline > .ant-menu-submenu-title:hover .ant-menu-submenu-arrow::after {
            background-image: none;
            background-color: var(--pl-text);
        }
        .ant-dropdown-menu-item-selected,
        .ant-menu-item-selected {
            background-color: var(--pl-bg-hover);
            color: var(--pl-primary);
        }

        /* ---------- select ----------
           v6: the field is '.ant-select-content' (was '.ant-select-selector');
           value text sits directly inside it, the editor is 'input'
           '.ant-select-input', the arrow is '.ant-select-suffix';
           '.ant-select-clear' / '.ant-select-placeholder' / option classes
           are unchanged. */
        .ant-select,
        .ant-select-content {
            color: var(--pl-text);
        }
        .ant-select {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
        }
        .ant-select:hover,
        .ant-select-focused {
            border-color: var(--pl-primary);
        }
        .ant-select-suffix,
        .ant-select-clear {
            color: var(--pl-text-secondary);
            background-color: transparent;
        }
        .ant-select-placeholder,
        .ant-select-input::placeholder {
            color: var(--pl-text-tertiary);
        }
        .ant-select-content,
        .ant-select-input,
        .ant-select-item-option {
            color: var(--pl-text);
        }
        .ant-select-dropdown {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 2px 8px var(--pl-shadow);
        }
        .ant-select-item-option-active,
        .ant-select-item-option:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-select-item-option-selected {
            background-color: var(--pl-bg-hover);
            color: var(--pl-primary);
        }
        .ant-select-item-group {
            color: var(--pl-text-secondary);
        }

        /* ---------- input / form ---------- */
        .ant-input,
        .ant-input-number,
        .ant-input-affix-wrapper .ant-input {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-input:hover,
        .ant-input:focus,
        .ant-input-number:hover,
        .ant-input-number-focused {
            border-color: var(--pl-primary);
            box-shadow: none;
        }
        .ant-input::placeholder,
        .ant-input-number-input::placeholder,
        .ant-select-input::placeholder {
            color: var(--pl-text-tertiary);
        }
        .ant-input-affix-wrapper:hover .ant-input:not(.ant-input-disabled) {
            border-color: var(--pl-primary);
        }
        /* antd forces background-color: #fff on inputs inside a failed form
           item (.ant-form-item-has-error .ant-input, 0-3-0),
           which beats the plain .ant-input override above and paints a white
           block over the light night-theme text (e.g. the board Name field
           while its name is reported as duplicated). Keep the themed surface;
           only the border stays red to signal the error. */
        .ant-form-item-has-error .ant-input,
        .ant-form-item-has-error .ant-input:hover,
        .ant-form-item-has-error .ant-input-affix-wrapper .ant-input,
        .ant-form-item-has-error .ant-input-affix-wrapper .ant-input:hover {
            background-color: var(--pl-bg-elevated);
            border-color: #f5222d;
        }
        .ant-form-item-has-error .ant-input:focus,
        .ant-form-item-has-error .ant-input-affix-wrapper .ant-input:focus {
            background-color: var(--pl-bg-elevated);
            border-color: #ff4d4f;
        }
        .ant-form-item-label > label,
        .ant-form-item,
        .ant-form-explain,
        .ant-form-extra {
            color: var(--pl-text);
        }
        .ant-form-explain,
        .ant-form-extra {
            color: var(--pl-text-secondary);
        }
        .ant-form-item-required::before {
            color: #ff4d4f;
        }
        .ant-form-item-extra {
            color: var(--pl-text-secondary);
        }

        /* ---------- switch ---------- */
        .ant-switch {
            background-color: rgba(255, 255, 255, 0.25);
        }
        .ant-switch-checked {
            background-color: var(--pl-primary);
        }
        .ant-switch:focus {
            box-shadow: 0 0 0 2px rgba(23, 125, 220, 0.2);
        }

        /* ---------- slider ---------- */
        .ant-slider-rail {
            background-color: var(--pl-border);
        }
        .ant-slider-track {
            background-color: var(--pl-primary);
        }
        .ant-slider-handle {
            border-color: var(--pl-primary);
            background-color: var(--pl-bg-elevated);
        }
        .ant-slider-dot {
            border-color: var(--pl-border);
            background-color: var(--pl-bg-elevated);
        }
        .ant-slider-dot-active,
        .ant-slider-mark-text-active {
            border-color: var(--pl-primary);
            color: var(--pl-text);
        }
        .ant-slider-mark-text {
            color: var(--pl-text-secondary);
        }
        .ant-slider:hover .ant-slider-rail {
            background-color: var(--pl-text-tertiary);
        }

        /* ---------- divider ----------
           v6 renders text dividers as explicit '.ant-divider-rail' nodes
           (start/end), not ::before/::after on the root. */
        .ant-divider {
            background-color: var(--pl-border);
            border-top-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-divider-rail {
            border-top-color: var(--pl-border);
        }

        /* ---------- list ---------- */
        .ant-list {
            color: var(--pl-text);
        }
        .ant-list-item {
            border-bottom-color: var(--pl-border);
        }
        .ant-list-item-meta-title {
            color: var(--pl-text);
        }
        .ant-list-item-meta-description,
        .ant-list-item-content,
        .ant-list-empty-text {
            color: var(--pl-text-secondary);
        }
        .ant-list-split .ant-list-item:last-child {
            border-bottom-color: var(--pl-border);
        }
        .ant-list-bordered {
            border-color: var(--pl-border);
        }

        /* ---------- spin / progress ---------- */
        .ant-spin-dot-item {
            background-color: var(--pl-primary);
        }
        .ant-spin-description {
            color: var(--pl-text-secondary);
        }
        .ant-progress-text {
            color: var(--pl-text);
        }
        /* NOTE: the circle trail is NOT themed here on purpose.
           rc-progress writes the trail color as inline style (builtin default
           D9D9D9 gray), which beats any non-important CSS rule. The themed
           color is therefore passed via the railColor prop in
           Timer/Progress.tsx (a live var in inline style). */

        /* ---------- timeline ---------- */
        .ant-timeline-item-rail {
            border-left-color: var(--pl-border);
        }
        .ant-timeline-item-header {
            background-color: var(--pl-bg);
            border-color: var(--pl-primary);
        }
        .ant-timeline-item-content {
            color: var(--pl-text);
        }

        /* ---------- statistic ---------- */
        .ant-statistic-title {
            color: var(--pl-text-secondary);
        }
        .ant-statistic-content {
            color: var(--pl-text);
        }

        /* ---------- layout ---------- */
        .ant-layout {
            background-color: var(--pl-bg);
        }

        /* ---------- empty ---------- */
        .ant-empty-description {
            color: var(--pl-text-secondary);
        }

        /* ---------- pagination ---------- */
        .ant-pagination-item,
        .ant-pagination-prev,
        .ant-pagination-next,
        .ant-pagination-jump-prev,
        .ant-pagination-jump-next {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
        }
        .ant-pagination-item a,
        .ant-pagination-prev a,
        .ant-pagination-next a,
        .ant-pagination-jump-prev a,
        .ant-pagination-jump-next a {
            color: var(--pl-text);
        }
        .ant-pagination-item-active {
            border-color: var(--pl-primary);
        }
        .ant-pagination-item-active a {
            color: var(--pl-primary);
        }
        .ant-pagination-disabled a,
        .ant-pagination-disabled:hover a {
            color: var(--pl-text-tertiary);
        }

        /* ---------- message ---------- */
        .ant-message-notice {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 4px 12px var(--pl-shadow);
            color: var(--pl-text);
        }

        /* ---------- date picker ---------- */
        .ant-picker,
        .ant-picker-input > input,
        .ant-picker-panel,
        .ant-picker-header,
        .ant-picker-content th,
        .ant-picker-cell,
        .ant-picker-footer,
        .ant-picker-time-panel {
            color: var(--pl-text);
        }
        .ant-picker,
        .ant-picker-panel,
        .ant-picker-time-panel-column > li {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
        }
        .ant-picker-header,
        .ant-picker-footer {
            border-color: var(--pl-border);
        }
        .ant-picker-header button,
        .ant-picker-content th,
        .ant-picker-cell-disabled .ant-picker-cell-inner {
            color: var(--pl-text-secondary);
        }
        .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner::before {
            border-color: var(--pl-primary);
        }
        .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner,
        .ant-picker-cell-in-view.ant-picker-cell-range-start .ant-picker-cell-inner,
        .ant-picker-cell-in-view.ant-picker-cell-range-end .ant-picker-cell-inner {
            background-color: var(--pl-primary);
            color: #fff;
        }
        .ant-picker-cell-in-view:not(.ant-picker-cell-selected):hover .ant-picker-cell-inner {
            background-color: var(--pl-bg-hover);
        }
        /* ---------- notification ---------- */
        .ant-notification-notice {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 4px 12px var(--pl-shadow);
        }
        .ant-notification-notice-message,
        .ant-notification-notice-description {
            color: var(--pl-text);
        }
        .ant-notification-notice-description {
            color: var(--pl-text-secondary);
        }
        .ant-notification-notice-close {
            color: var(--pl-text-secondary);
        }
        .ant-notification-notice-close:hover {
            color: var(--pl-text);
        }
    }

    /* Timer/Progress.tsx renders antd's Circle directly instead of going
       through the Progress component. antd v5+ ships its component CSS through
       cssinjs, and those styles are only registered when the Progress component
       itself renders, so none of them exist here. Provide the positioning they
       would normally add ourselves.

       It must be pinned to the wrapper this app renders (.ant-progress), not
       to the circle's inner container: antd v5 called it '-inner', v6 renamed
       it to '-body'. While the selector still said '-inner' it silently stopped
       matching, so the text lost its 'line-height: 1' (the number's line box
       grew from 51px to 68px, pushing the mode label further down) and was
       positioned against ProgressContainer instead of the 300px circle. */
    html[data-theme] .ant-progress.ant-progress-circle {
        position: relative;
        line-height: 1;
    }
    html[data-theme] .ant-progress-circle .ant-progress-text {
        position: absolute;
        top: 50%;
        left: 0;
        box-sizing: border-box;
        width: 100%;
        margin: 0;
        padding: 0;
        line-height: 1;
        transform: translateY(-50%);
        text-align: center;
        white-space: normal;
    }
    html[data-theme] .ant-progress-text {
        color: var(--pl-text);
    }

    /* ---------- feedback layer ---------- */
    /* One visual language for toast / notice / dialog / popconfirm: same
       surface color, 8px radius, shadow and selectable copy. The colors come
       from the theme tokens, so these rules fit both themes -- the
       html[data-theme] prefix raises specificity above generated component CSS.
       Keep in sync with components/feedback/tokens.ts. */
    html[data-theme] .pl-feedback-text {
        /* Copy of a feedback surface can always be selected (the guide dialog
           used to disable selection on its whole container). */
        user-select: text;
    }

    /* toast (antd message) */
    html[data-theme] .ant-message-notice {
        background-color: var(--pl-bg-elevated);
        border: 1px solid var(--pl-border);
        border-radius: 8px;
        box-shadow: 0 4px 12px var(--pl-shadow);
        color: var(--pl-text);
        user-select: text;
        max-width: calc(100vw - 32px);
        white-space: normal;
        word-break: break-word;
    }

    /* notice (antd notification) */
    html[data-theme] .ant-notification {
        max-width: calc(100vw - 24px);
    }
    html[data-theme] .ant-notification-notice {
        background-color: var(--pl-bg-elevated);
        border: 1px solid var(--pl-border);
        border-radius: 8px;
        box-shadow: 0 4px 12px var(--pl-shadow);
        user-select: text;
        width: auto;
        min-width: 260px;
        max-width: calc(100vw - 48px);
    }
    html[data-theme] .ant-notification-notice-message {
        color: var(--pl-text);
    }
    html[data-theme] .ant-notification-notice-description {
        color: var(--pl-text-secondary);
    }

    /* dialog (antd modal, including confirm / info) */
    html[data-theme] .ant-modal {
        max-width: calc(100vw - 32px);
    }
    html[data-theme] .ant-modal-container {
        border-radius: 8px;
        user-select: text;
    }
    /* antd 5/6 dropped the header and footer rulings that antd 3 drew on every
       dialog. Without them the title sits only 8px above the first form row
       (the Distracting App Setting form looked cramped and borderless), so put
       the lines and the old 24px body gap back. The surface container is
       padded 24px horizontally; the negative margins let both lines span the
       full dialog width like they used to. */
    html[data-theme] .ant-modal-header {
        margin-left: -24px;
        margin-right: -24px;
        margin-bottom: 24px;
        padding: 0 24px 16px;
        border-bottom: 1px solid var(--pl-border);
    }
    html[data-theme] .ant-modal-footer {
        margin-left: -24px;
        margin-right: -24px;
        padding: 12px 24px 0;
        border-top: 1px solid var(--pl-border);
    }
    /* Confirm title and body use explicit colors instead of inheriting from the
       modal, so override both for the night theme. */
    html[data-theme] .ant-modal-confirm-title {
        color: var(--pl-text);
    }
    html[data-theme] .ant-modal-confirm-content {
        color: var(--pl-text);
    }
    html[data-theme] .ant-modal-confirm-body > .anticon {
        font-size: 20px;
    }

    /* popconfirm / popover */
    html[data-theme] .ant-popover-container {
        border-radius: 8px;
        border: 1px solid var(--pl-border);
    }
    html[data-theme] .ant-popover-content,
    html[data-theme] .ant-popconfirm-message {
        user-select: text;
    }
`;

export default GlobalStyle;
