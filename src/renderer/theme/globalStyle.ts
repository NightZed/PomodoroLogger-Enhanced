import { createGlobalStyle } from 'styled-components';

/**
 * Global (document level) theme layer.
 *
 * Our own components read the `--pl-*` custom properties written by
 * `applyTheme()`, so they follow the active theme automatically. antd 3 has
 * neither a dark stylesheet nor CSS variables, hence its components are adapted
 * here: every override lives under `html[data-theme='dark']`, which gives it a
 * higher specificity than the plain `.ant-*` selectors shipped in
 * `antd/dist/antd.css` (loaded through style-loader, so the injection order
 * cannot be relied upon).
 *
 * Only neutral surfaces (background / border / text) are overridden: brand
 * colored buttons keep antd's blue so actions stay recognizable.
 */
export const GlobalStyle = createGlobalStyle`
    /* Fallback so the very first frame already matches the default (night) theme. */
    :root {
        --pl-bg: #141414;
        --pl-bg-elevated: #1f1f1f;
        --pl-bg-sunken: #262626;
        --pl-bg-hover: rgba(255, 255, 255, 0.08);
        --pl-text: rgba(255, 255, 255, 0.85);
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
        background-color: var(--pl-bg);
        color: var(--pl-text);
    }

    /* antd.css ships its own body rule (color rgba(0, 0, 0, 0.65), background
       #fff) and its stylesheet is injected after the styled-components one.
       !important makes the theme colors win regardless of stylesheet order. */
    html[data-theme] body {
        background-color: var(--pl-bg) !important;
        color: var(--pl-text) !important;
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
        .ant-tabs-bar {
            background-color: var(--pl-bg-elevated);
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
        .ant-tabs.ant-tabs-card > .ant-tabs-bar .ant-tabs-tab {
            background-color: var(--pl-bg-sunken);
            border-color: var(--pl-border);
            color: var(--pl-text-secondary);
        }
        .ant-tabs.ant-tabs-card > .ant-tabs-bar .ant-tabs-tab:hover {
            color: var(--pl-primary);
        }
        .ant-tabs.ant-tabs-card > .ant-tabs-bar .ant-tabs-tab-active {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-primary);
            color: var(--pl-primary);
        }

        /* ---------- buttons: neutral ones only ---------- */
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-danger):not(.ant-btn-link) {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-danger):not(.ant-btn-link):hover,
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-danger):not(.ant-btn-link):focus {
            background-color: var(--pl-bg-hover);
            border-color: var(--pl-primary);
            color: var(--pl-primary);
        }
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-danger):not(.ant-btn-link)[disabled],
        .ant-btn:not(.ant-btn-primary):not(.ant-btn-danger):not(.ant-btn-link)[disabled]:hover {
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
        .ant-table-tbody > tr:hover > td,
        .ant-table-thead > tr:hover > th {
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

        /* ---------- modal ---------- */
        .ant-modal-content {
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

        /* ---------- popover / popconfirm ---------- */
        .ant-popover-inner {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 2px 8px var(--pl-shadow);
        }
        .ant-popover-title {
            border-bottom-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-popover-inner-content,
        .ant-popover-message {
            color: var(--pl-text);
        }
        .ant-popover-arrow {
            border-color: var(--pl-border);
            background-color: var(--pl-bg-elevated);
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

        /* ---------- select ---------- */
        .ant-select,
        .ant-select-selection {
            color: var(--pl-text);
        }
        .ant-select-selection {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
        }
        .ant-select:hover .ant-select-selection,
        .ant-select-focused .ant-select-selection {
            border-color: var(--pl-primary);
        }
        .ant-select-arrow,
        .ant-select-selection__clear {
            color: var(--pl-text-secondary);
            background-color: transparent;
        }
        .ant-select-selection__placeholder,
        .ant-select-search__field__placeholder {
            color: var(--pl-text-tertiary);
        }
        .ant-select-selection__rendered .ant-select-selection-selected-value,
        .ant-select-search__field {
            color: var(--pl-text);
        }
        .ant-select-dropdown {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 2px 8px var(--pl-shadow);
        }
        .ant-select-dropdown-menu-item {
            color: var(--pl-text);
        }
        .ant-select-dropdown-menu-item-active,
        .ant-select-dropdown-menu-item:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-select-dropdown-menu-item-selected {
            background-color: var(--pl-bg-hover);
            color: var(--pl-primary);
        }
        .ant-select-dropdown-menu-item-divider {
            background-color: var(--pl-border);
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
        .ant-select-search__field::placeholder {
            color: var(--pl-text-tertiary);
        }
        .ant-input-affix-wrapper:hover .ant-input:not(.ant-input-disabled) {
            border-color: var(--pl-primary);
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

        /* ---------- divider ---------- */
        .ant-divider {
            background-color: var(--pl-border);
            border-top-color: var(--pl-border);
            color: var(--pl-text);
        }
        .ant-divider-horizontal.ant-divider-with-text-center::before,
        .ant-divider-horizontal.ant-divider-with-text-left::before,
        .ant-divider-horizontal.ant-divider-with-text-right::before,
        .ant-divider-horizontal.ant-divider-with-text-center::after,
        .ant-divider-horizontal.ant-divider-with-text-left::after,
        .ant-divider-horizontal.ant-divider-with-text-right::after {
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
        .ant-spin-dot i {
            background-color: var(--pl-primary);
        }
        .ant-spin-text {
            color: var(--pl-text-secondary);
        }
        .ant-progress-text {
            color: var(--pl-text);
        }
        .ant-progress-circle-trail {
            stroke: var(--pl-border);
        }

        /* ---------- timeline ---------- */
        .ant-timeline-item-tail {
            border-left-color: var(--pl-border);
        }
        .ant-timeline-item-head {
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
        .ant-empty-img-simple-ellipse,
        .ant-empty-img-simple-g {
            fill: var(--pl-bg-elevated);
        }
        .ant-empty-img-simple-path {
            fill: var(--pl-bg-sunken);
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
        .ant-message-notice-content {
            background-color: var(--pl-bg-elevated);
            box-shadow: 0 4px 12px var(--pl-shadow);
            color: var(--pl-text);
        }

        /* ---------- date picker / calendar panel ---------- */
        .ant-calendar {
            background-color: var(--pl-bg-elevated);
            border-color: var(--pl-border);
            box-shadow: 0 2px 8px var(--pl-shadow);
        }
        .ant-calendar-input-wrap {
            border-bottom-color: var(--pl-border);
        }
        .ant-calendar-input {
            background-color: transparent;
            color: var(--pl-text);
        }
        .ant-calendar-header {
            border-bottom-color: var(--pl-border);
        }
        .ant-calendar-header .ant-calendar-prev-year-btn,
        .ant-calendar-header .ant-calendar-next-year-btn,
        .ant-calendar-header .ant-calendar-prev-month-btn,
        .ant-calendar-header .ant-calendar-next-month-btn,
        .ant-calendar-header a {
            color: var(--pl-text-secondary);
        }
        .ant-calendar-header .ant-calendar-month-select,
        .ant-calendar-header .ant-calendar-year-select {
            color: var(--pl-text);
        }
        .ant-calendar-header .ant-calendar-month-select:hover,
        .ant-calendar-header .ant-calendar-year-select:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-calendar-column-header {
            color: var(--pl-text-secondary);
        }
        .ant-calendar-date {
            color: var(--pl-text);
        }
        .ant-calendar-date:hover {
            background-color: var(--pl-bg-hover);
            border-color: var(--pl-primary);
        }
        .ant-calendar-today .ant-calendar-date {
            border-color: var(--pl-primary);
            color: var(--pl-primary);
        }
        .ant-calendar-selected-day .ant-calendar-date {
            background-color: var(--pl-primary);
            border-color: var(--pl-primary);
            color: #fff;
        }
        .ant-calendar-last-month-cell .ant-calendar-date,
        .ant-calendar-next-month-btn-day .ant-calendar-date,
        .ant-calendar-disabled-cell .ant-calendar-date {
            color: var(--pl-text-tertiary);
        }
        .ant-calendar-footer {
            border-top-color: var(--pl-border);
        }
        .ant-calendar-footer .ant-calendar-today-btn,
        .ant-calendar-footer .ant-calendar-time-picker-btn {
            color: var(--pl-primary);
        }
        .ant-calendar-footer .ant-calendar-today-btn:hover,
        .ant-calendar-footer .ant-calendar-time-picker-btn:hover {
            color: var(--pl-text);
        }
        .ant-calendar-picker-clear {
            background-color: var(--pl-bg-elevated);
            color: var(--pl-text-tertiary);
        }
        .ant-calendar-picker-icon {
            color: var(--pl-text-tertiary);
        }
        /* time column (DatePicker with showTime) */
        .ant-calendar-time-picker,
        .ant-calendar-time-picker-inner {
            background-color: var(--pl-bg-elevated);
        }
        .ant-calendar-time-picker-header {
            border-bottom-color: var(--pl-border);
            color: var(--pl-text-secondary);
        }
        .ant-calendar-time-picker-select li {
            color: var(--pl-text);
        }
        .ant-calendar-time-picker-select li:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-calendar-time-picker-select li.ant-calendar-time-picker-select-option-selected {
            background-color: var(--pl-bg-hover);
            color: var(--pl-primary);
            font-weight: 600;
        }
        /* month / year / decade sub panels */
        .ant-calendar-month-panel,
        .ant-calendar-year-panel,
        .ant-calendar-decade-panel {
            background-color: var(--pl-bg-elevated);
        }
        .ant-calendar-month-panel-header,
        .ant-calendar-year-panel-header,
        .ant-calendar-decade-panel-header {
            border-bottom-color: var(--pl-border);
        }
        .ant-calendar-month-panel-header a,
        .ant-calendar-year-panel-header a,
        .ant-calendar-decade-panel-header a {
            color: var(--pl-text-secondary);
        }
        .ant-calendar-month-panel-month,
        .ant-calendar-year-panel-year,
        .ant-calendar-decade-panel-decade {
            color: var(--pl-text);
        }
        .ant-calendar-month-panel-month:hover,
        .ant-calendar-year-panel-year:hover,
        .ant-calendar-decade-panel-decade:hover {
            background-color: var(--pl-bg-hover);
        }
        .ant-calendar-month-panel-month-selected,
        .ant-calendar-year-panel-year-selected,
        .ant-calendar-decade-panel-decade-selected {
            background-color: var(--pl-primary);
            color: #fff;
        }
        .ant-calendar-month-panel-cell-disabled .ant-calendar-month-panel-month,
        .ant-calendar-year-panel-cell-disabled .ant-calendar-year-panel-year {
            color: var(--pl-text-tertiary);
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
`;

export default GlobalStyle;
