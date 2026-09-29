import { Story } from './type';

/**
 * Tour anchors: prefer `[data-tour="..."]` over antd internals / ids.
 * - `[data-tour="kanban-tab"]` — Kanban tab in AppTitleBar (was `.ant-tabs-nav div:nth-child(2)`)
 * - `[data-tour="create-kanban-button"]` — plus button on Kanban overview
 * - `[data-tour="kanban-brief-card"]` — first board card (was `.kanban-brief-card`)
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
 */
export const timerStories: Story[] = [
    {
        name: 'start-timer',
        stepId: 'timer.start',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#start-timer-button',
        hint: 'This button starts the count-down timer. Press OK to continue (the tour will not start it for you).',
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
        hint: 'Clicking the same button again pauses the timer.',
    },
    {
        name: 'stop-timer',
        stepId: 'timer.stop',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#stop-timer-button',
        hasConfirm: true,
        hint: 'You can stop the timer here',
    },
    {
        name: 'focus-selector',
        stepId: 'timer.focus',
        useMask: true,
        spotlight: true,
        pointerTargetSelector: '#focus-selector',
        pointerDirection: Math.PI / 2,
        hasConfirm: true,
        hint: 'Every Pomodoro record will be linked to the Kanban which you are focusing on',
    },
    {
        name: 'switch-mode',
        stepId: 'timer.mode',
        useMask: true,
        spotlight: true,
        // #timer-mode's visible icon+label are absolutely-positioned children;
        // the parent box is a long strip, so measure the children union instead.
        unionChildren: true,
        pointerTargetSelector: '[data-tour="timer-mode"]',
        hasConfirm: true,
        hint: 'There are focus sessions and rest sessions. You can click the icon to switch them.',
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
        hint: "Let's switch to Kanban board (click the Kanban tab, or press OK to go there)",
        hasConfirm: true,
        waitForTargetMs: 8000,
    },
    {
        name: 'introduction',
        stepId: 'kanban.intro-overview',
        useMask: false,
        hint:
            'Kanban is a workflow management method designed to visualize your work. ' +
            'This is the overview page of all the kanban boards.',
        hasConfirm: true,
    },
    {
        name: 'create-board',
        stepId: 'kanban.create-click',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        hint: "Let's create a new Kanban!",
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
        hint: 'Give your board a name, save it, then press OK to continue.',
        hasConfirm: true,
    },
    {
        name: 'enter-kanban',
        stepId: 'kanban.enter',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        pointerTargetSelector: '[data-tour="kanban-brief-card"]',
        hint: "Let's visit this Kanban! (click the card)",
        hasConfirm: false,
        waitForTargetMs: 12000,
    },
    {
        name: 'intro',
        stepId: 'kanban.board-lists',
        useMask: false,
        hasConfirm: true,
        hint: 'Kanban board has 4 lists by default: backlog, todo, in progress and done. ',
    },
    {
        name: 'intro',
        stepId: 'kanban.board-cards',
        useMask: false,
        hasConfirm: true,
        hint: 'Every list has its own cards. You can create new cards and move it between the lists',
    },
    {
        name: 'intro',
        stepId: 'kanban.focused-list',
        useMask: true,
        spotlight: true,
        hasConfirm: true,
        pointerTargetSelector: '#focused-list',
        pointerDirection: -Math.PI / 2,
        hint:
            'When focusing on this Kanban, the related Pomodoro records will be add to the cards ' +
            'from In Progress list',
        waitForTargetMs: 8000,
    },
    {
        name: 'intro',
        stepId: 'kanban.open-card',
        useMask: true,
        spotlight: true,
        advanceOnTargetClick: true,
        hasConfirm: false,
        pointerTargetSelector: '.kanban-card',
        hint: "Let's go to card configure page",
        waitForTargetMs: 8000,
    },
    {
        name: 'intro',
        stepId: 'kanban.estimation',
        useMask: false,
        hasConfirm: true,
        hint:
            'Pomodoro Logger enables you to manage your time accurately. ' +
            'It will track your exact focusing time on this task.' +
            "Once you set your estimation, it's able to rate your estimation.",
        dialogPosition: { left: 24, bottom: 24 },
    },
];

export const allStories: Story[] = timerStories.concat(kanbanStories);
