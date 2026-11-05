import { Story } from './type';

/**
 * Tour anchors: prefer `[data-tour="..."]` over antd internals / ids.
 * - `[data-tour="kanban-tab"]` — Kanban tab in AppTitleBar (was `.ant-tabs-nav div:nth-child(2)`)
 * - `[data-tour="create-kanban-button"]` — plus button on Kanban overview
 * - `[data-tour="kanban-brief-card"]` — first board card (was `.kanban-brief-card`)
 * - `[data-tour="focused-list"]` — focused list inside the board (NOT the Timer
 *   sider's preview, which is a second mounted copy of the same list id)
 * - `[data-tour="kanban-card"]` — first card of each list inside the board; the
 *   visible-target lookup picks the first one that actually exists (same caveat)
 * - `[data-tour="timer-mode"]` — work/rest icon+label (tight box, see WorkRestIcon)
 *
 * Interaction convention ("demo, don't touch"):
 * - Timer steps are DEMO-ONLY: spotlight hole BLOCKS clicks, user only looks
 *   and presses OK. The tour never triggers real actions itself, so it can no
 *   longer pop the "No focusing project" warning or start/pause the timer.
 * - Cross-page steps (`switch-tab`, `enter-kanban`) use
 *   `advanceOnTargetClick: true` + click-through `spotlight`, so clicking the
 *   real target both performs the navigation AND advances the tour.
 * - Dialog OK on click-through steps also clicks the target first (see UserGuide),
 *   so "Take me there" never leaves the user on the wrong page.
 * - Modal steps use `useMask: false` + no pointer so the antd Modal stays clickable.
 *
 * The copy lives in the dictionaries (`tour.*`); the steps only carry keys, so a
 * language switch needs no change here.
 */
export const timerStories: Story[] = [
    {
        name: 'start-timer',
        stepId: 'timer.start',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#start-timer-button',
        hintKey: 'tour.timer.start',
        hasConfirm: true,
    },
    {
        name: 'pause-timer',
        stepId: 'timer.pause',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#start-timer-button',
        pointerDirection: Math.PI / 2,
        hasConfirm: true,
        hintKey: 'tour.timer.pause',
    },
    {
        name: 'stop-timer',
        stepId: 'timer.stop',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#stop-timer-button',
        hasConfirm: true,
        hintKey: 'tour.timer.stop',
    },
    {
        name: 'focus-selector',
        stepId: 'timer.focus',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#focus-selector',
        pointerDirection: Math.PI / 2,
        hasConfirm: true,
        hintKey: 'tour.timer.focus',
    },
    {
        name: 'switch-mode',
        stepId: 'timer.mode',
        useMask: true,
        spotlight: true,
        // #timer-mode's icon and label are stacked in one slot; measure the
        // children union so the spotlight covers the taller icon as well.
        unionChildren: true,
        pointerTargetSelector: '[data-tour="timer-mode"]',
        hasConfirm: true,
        hintKey: 'tour.timer.mode',
    },
];

export const kanbanStories: Story[] = [
    {
        name: 'kanban',
        stepId: 'kanban.switch-tab',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        pointerTargetSelector: '[data-tour="kanban-tab"]',
        pointerDirection: Math.PI / 2,
        hintKey: 'tour.kanban.switchTab',
        hasConfirm: true,
        waitForTargetMs: 8000,
    },
    {
        name: 'introduction',
        stepId: 'kanban.intro-overview',
        useMask: false,
        hintKey: 'tour.kanban.introOverview',
        hasConfirm: true,
    },
    {
        name: 'create-board',
        stepId: 'kanban.create-click',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        hintKey: 'tour.kanban.createClick',
        hasConfirm: false,
        pointerTargetSelector: '[data-tour="create-kanban-button"]',
        pointerDirection: Math.PI / 2,
        waitForTargetMs: 8000,
    },
    {
        // Modal is open here: no mask / no pointer so the form stays clickable.
        // The old selector `.ant-btn-primary` could match ANY primary button
        // (including this guide's own OK). User confirms in the modal, then OK here.
        name: 'create-board',
        stepId: 'kanban.create-confirm',
        useMask: false,
        hintKey: 'tour.kanban.createConfirm',
        hasConfirm: true,
    },
    {
        name: 'enter-kanban',
        stepId: 'kanban.enter',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        pointerTargetSelector: '[data-tour="kanban-brief-card"]',
        hintKey: 'tour.kanban.enter',
        hasConfirm: false,
        waitForTargetMs: 12000,
    },
    {
        name: 'intro',
        stepId: 'kanban.board-lists',
        useMask: false,
        hasConfirm: true,
        hintKey: 'tour.kanban.boardLists',
    },
    {
        name: 'intro',
        stepId: 'kanban.board-cards',
        useMask: false,
        hasConfirm: true,
        hintKey: 'tour.kanban.boardCards',
    },
    {
        name: 'intro',
        stepId: 'kanban.focused-list',
        useMask: true,
        spotlight: true,
        hasConfirm: true,
        pointerTargetSelector: '[data-tour="focused-list"]',
        pointerDirection: -Math.PI / 2,
        hintKey: 'tour.kanban.focusedList',
        waitForTargetMs: 8000,
    },
    {
        name: 'intro',
        stepId: 'kanban.open-card',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        hasConfirm: false,
        pointerTargetSelector: '[data-tour="kanban-card"]',
        hintKey: 'tour.kanban.openCard',
        waitForTargetMs: 8000,
    },
    {
        name: 'intro',
        stepId: 'kanban.estimation',
        useMask: false,
        hasConfirm: true,
        hintKey: 'tour.kanban.estimation',
        dialogPosition: { left: 24, bottom: 24 },
    },
];

export const allStories: Story[] = timerStories.concat(kanbanStories);
