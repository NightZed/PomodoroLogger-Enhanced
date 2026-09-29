export interface Position {
    left?: number | string;
    right?: number | string;
    top?: number | string;
    bottom?: number | string;
}

export type StoryAdvanceMode = 'click-target' | 'confirm' | 'auto';

export interface Story {
    name: string;
    /** Stable id for resume / deep-link. Defaults to `${name}#${index}` when omitted. */
    stepId?: string;
    pointerTargetSelector?: string;
    pointerDirection?: number;
    targetJumping?: boolean; // whether jumping up and down

    blurId?: string;

    useMask: boolean;
    /** When true, render hollow spotlight (click-through hole) instead of full mask + zIndex hack. */
    spotlight?: boolean;
    /**
     * When true, the spotlight hole lets clicks pass through to the real target
     * AND advances the tour (used for cross-page steps like switch-tab / enter-kanban).
     * When false/omitted (default), the spotlight hole BLOCKS clicks on the target:
     * demo-only steps where the user should just look and press OK.
     * This prevents the tour itself from triggering real actions
     * (e.g. starting the timer and popping the "No focusing project" warning).
     */
    advanceOnTargetClick?: boolean;
    /** How long (ms) to wait for target to mount/become visible before showing waiting hint. */
    waitForTargetMs?: number;
    /**
     * Measure union of the target's visible children (see SpotlightProps.unionChildren).
     * Needed for #timer-mode whose visible icon+label live in absolute children.
     */
    unionChildren?: boolean;
    hint?: string;
    dialogPosition?: Position;

    hasConfirm?: boolean; // use confirm button
    confirmElementId?: string; // confirm on element clicked

    minHeight?: number;
    minWidth?: number;

    reactNode?: any;
}

export interface UserGuideState {
    currentStoryIndex: number;
}
