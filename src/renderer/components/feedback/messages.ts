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
        /**
         * A mode switch was asked for while a session is in the way (Tab or the
         * work/rest icon). Both the reason and the way out depend on the state:
         * a running session has to be paused or stopped first, a paused one
         * continued or stopped.
         */
        cannotSwitchMode: (isFocusing: boolean, isRunning: boolean) =>
            `Cannot switch mode while a ${isFocusing ? 'focus session' : 'break'} is ` +
            `${isRunning ? 'running' : 'paused'} — ${isRunning ? 'pause' : 'continue'} or ` +
            'stop it first.',
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
        /** Export / import results, and the report of a refused file. */
        exportDone: (fileName: string) => `Data exported to ${fileName}`,
        exportFailed: 'Export Failed',
        exportFailedDetail: (reason: string) => `The data could not be exported: ${reason}`,
        importInvalidTitle: 'This file cannot be imported',
        importInvalidIntro:
            'Nothing was imported and your current data was left untouched. ' +
            'Fix the problems below in the file, then import it again:',
        importWarningTitle: 'Imported with warnings',
        importWarningIntro: 'The data was imported, but some entries had to be adjusted:',
        importDone: 'Data imported. Restarting…',
        importFailed: 'Import Failed',
        importFailedDetail: (reason: string) => `The data could not be imported: ${reason}`,
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
