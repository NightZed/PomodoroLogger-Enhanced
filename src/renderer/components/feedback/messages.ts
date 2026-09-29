/**
 * User facing feedback copy.
 *
 * Only the strings that are shared between files, or that describe one flow in
 * several steps (the update pipeline), live here: keeping them together is what
 * makes "same situation -> same wording" enforceable. Whole-screen copy stays
 * next to its screen.
 */
export const FEEDBACK_MESSAGES = {
    /** Cards / kanban board actions. */
    kanban: {
        startFocusing: 'Start Focusing',
        paused: 'Paused',
        labelExists: '标签已存在 / Label already exists',
        cannotDeleteList: 'Cannot delete the focused / done list.',
    },
    /** Timer actions. */
    timer: {
        // Covers a running timer and a paused session alike: pausing keeps the
        // session alive, so switching modes at that point would drop it.
        cannotSwitchMode: 'Cannot switch mode while a session is in progress',
        finishTooEarly: 'Focus at least for 10 minutes to finish',
    },
    /** Statistic views. */
    statistics: {
        sankeyOutdated:
            'Cannot plot Sankey Diagram. ' +
            'Chosen pomodoro was recorded in a version that lacks of required data',
    },
    /** In place confirmations. */
    confirm: {
        defaultTitle: 'Are you sure?',
    },
    /** Settings page. */
    setting: {
        restartToApply: 'Restart App to Apply Changes',
        screenshotRestart: 'Screenshot setting change needs restart to be applied',
        hardwareAccelerationRestart:
            'Hardware acceleration setting change needs restart to be applied',
        dataRemoved: 'All user data is removed. Pomodoro needs to restart.',
        importConfirm: 'Pomodoro Logger will restart after importing. Continue?',
        deleteAllConfirm: 'Sure to delete?',
    },
    /**
     * The update pipeline: check -> download -> install. Every step reports
     * through the same channels (`toast` for the check result, `notice` for the
     * background phases, `confirm`/`alert` for the two decisions).
     */
    update: {
        available: 'Update Available',
        availableIntro: 'A new version is available:',
        availableQuestion: 'Start downloading now?',
        downloadNow: 'Download',
        downloading: 'Downloading Update',
        downloaded: 'Update Downloaded',
        downloadedDescription:
            'Restart now to install the update, or quit the app to install it later.',
        restartAndInstall: 'Restart & Install',
        installing: 'Installing Update',
        installingDescription:
            'The application is quitting to install the update. ' +
            'It will start again automatically once the installation finishes.',
        failed: (phase: string) => `Update ${phase} Failed`,
        phase: {
            check: 'Check',
            download: 'Download',
            install: 'Install',
        },
        versionLabel: 'Version',
        manualDownloadHint: 'You can download manually from ',
        checkFailed: (detail: string) => `Failed to check for update: ${detail}`,
    },
};
