/**
 * The English catalog.
 *
 * This file is the single source of truth for the message keys: `MessageKey`,
 * `MessageArgs` and `PlainMessageKey` are derived from it (see `keys.ts`), and
 * `zh.ts` is typed as `CatalogShape<typeof en>` so a translation can neither
 * miss a key nor mistype an interpolation argument.
 *
 * Do not add `as const`: string leaves must stay `string`.
 *
 * Interpolation is done by writing the value as a function -- the parameters
 * are the contract the translation has to satisfy. Keep the existing positional
 * signatures, they are part of the public surface of `FEEDBACK_MESSAGES`.
 */

/** English has a singular and a plural form; the other catalogs ignore `count`. */
const plural = (count: number, one: string, other: string): string => (count === 1 ? one : other);

export const en = {
    app: {
        /** Product name. Intentionally identical in every language. */
        title: 'Pomodoro Logger Enhanced',
    },

    common: {
        ok: 'OK',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        retry: 'Retry',
        choose: 'Choose',
        clear: 'Clear',
        reset: 'Reset',
        import: 'Import',
        edit: 'Edit',
    },

    theme: {
        day: 'Day',
        night: 'Night',
    },

    window: {
        alwaysOnTopEnable: 'Enable always on top',
        alwaysOnTopDisable: 'Disable always on top',
        minimize: 'Minimize',
        maximize: 'Maximize',
        restore: 'Restore Down',
        close: 'Close',
    },

    search: {
        expand: 'Expand search panel',
    },

    calendar: {
        month: {
            jan: 'Jan',
            feb: 'Feb',
            mar: 'Mar',
            apr: 'Apr',
            may: 'May',
            jun: 'Jun',
            jul: 'Jul',
            aug: 'Aug',
            sep: 'Sep',
            oct: 'Oct',
            nov: 'Nov',
            dec: 'Dec',
        },
        weekday: {
            sun: 'Sun',
            mon: 'Mon',
            tue: 'Tue',
            wed: 'Wed',
            thu: 'Thur',
            fri: 'Fri',
            sat: 'Sat',
        },
    },

    tour: {
        startGuide: 'Start guide',
        resumeGuide: 'Resume guide',
        back: 'Back',
        exit: 'Exit tour',
        notNow: 'Not now',
        takeMeThere: 'Take me there',
        waiting: 'Waiting for the highlighted area to appear…',
        step: (current: number, total: number): string => `Step ${current} / ${total}`,
        timer: {
            start: 'This button starts the count-down timer. Press OK to continue (the tour will not start it for you).',
            pause: 'Clicking the same button again pauses the timer.',
            stop: 'You can stop the timer here',
            focus: 'Every Pomodoro record will be linked to the Kanban which you are focusing on',
            mode: 'There are focus sessions and rest sessions. You can click the icon to switch them.',
        },
        kanban: {
            switchTab:
                "Let's switch to Kanban board (click the Kanban tab, or press OK to go there)",
            introOverview:
                'Kanban is a workflow management method designed to visualize your work. ' +
                'This is the overview page of all the kanban boards.',
            createClick: "Let's create a new Kanban!",
            createConfirm: 'Give your board a name, save it, then press OK to continue.',
            enter: "Let's visit this Kanban! (click the card)",
            boardLists: 'Kanban board has 4 lists by default: backlog, todo, in progress and done.',
            boardCards:
                'Every list has its own cards. You can create new cards and move it between the lists',
            focusedList:
                'When focusing on this Kanban, the related Pomodoro records will be add to the cards ' +
                'from In Progress list',
            openCard: "Let's go to card configure page",
            estimation:
                'Pomodoro Logger Enhanced enables you to manage your time accurately. ' +
                'It will track your exact focusing time on this task.' +
                "Once you set your estimation, it's able to rate your estimation.",
        },
    },

    tabs: {
        timer: 'Pomodoro',
        kanban: 'Kanban',
        history: 'History',
        setting: 'Setting',
    },

    timer: {
        tray: {
            startFocusing: 'Start Focusing',
            startBreak: 'Start Break',
            pause: 'Pause',
            continue: 'Continue',
            finish: 'Finish',
            stop: 'Stop',
        },
        warning: {
            noProjectTitle: 'No focusing project',
            noProjectContent:
                'You are starting a focus session without selecting a project. ' +
                'The session cannot be linked to any project. Click OK to start anyway.',
            noFocusCardsTitle: 'No cards in In Progress',
            noFocusCardsContent:
                'The "In Progress" list of the selected project is empty. ' +
                'The focus session cannot be linked to any card. Click OK to start anyway.',
            dontRemindAgain: "Don't remind me again",
        },
        notify: {
            restEndedTitle: 'Resting session ended',
            focusEndedTitle: 'Focusing finished. Start resting.',
            completedToday: (count: number): string =>
                `Completed ${count} ${plural(count, 'session', 'sessions')} today. \n\n`,
        },
        controls: {
            pause: 'Pause (F6)',
            start: 'Start (F5)',
            finish: 'Finish',
            switchMode: 'Switch Mode (Tab)',
            stop: 'Stop',
            showMore: 'Show More',
            switchTimerMode: 'Switch timer mode',
            switchTheme: 'Switch Theme',
            minimize: 'Minimize (F12)',
            compact: 'Compact (F11)',
            normal: 'Normal (F11)',
        },
        stats: {
            timeSpent: 'Time Spent',
            wordCloud: 'Word Cloud',
            pomodorosToday: 'Pomodoros Today',
        },
        session: {
            projectName: 'Project Name',
            break: 'Break',
            finished: 'Session Finished',
            todayPomodoros: 'Today Pomodoros',
            startFocusing: 'Start Focusing',
            startLongBreak: 'Start Long Break',
            startShortBreak: 'Start Short Break',
            longBreak: 'Long Break',
            shortBreak: 'Short Break',
            extend5: 'Extend 5 minutes',
            extend10: 'Extend 10 minutes',
        },
        focusSelector: {
            placeholder: 'Choose Your Focus',
            none: 'No Focusing Project',
        },
        mini: {
            startNext: 'Start Next Session',
            expand: 'Expand (F12)',
            noProject: 'No Focusing Project',
            working: 'Working',
            breaking: 'Breaking',
            finish: 'Finish',
            statePaused: (phase: string): string => `${phase} - Paused`,
            stateRunning: (phase: string): string => `${phase} - Running`,
        },
    },

    kanban: {
        page: {
            overviewTitle: 'Kanban Boards Overview',
            sortedBy: 'Sorted by:',
            sortRecent: 'Last Visit',
            sortCreated: 'Created Time',
            sortAlpha: 'Alphabet',
            sortSpent: 'Spent Time',
            sortRemaining: 'Remaining Time',
            ascending: 'Ascending',
            descending: 'Descending',
            showTable: 'Show Table:',
            cardView: 'Card view',
            cardTitleOnly: 'Title only',
            cardPreview: 'Preview (limited height)',
            cardFull: 'Full content',
            created: 'Created',
        },
        overview: {
            boardName: 'Board Name',
            estimatedLeft: 'Estimated Left Time',
            spentTime: 'Spent Time',
            pomodoros: 'Pomodoros',
            meanError: 'Mean Estimate Error',
            trend: 'Trend',
        },
        boardEditor: {
            createTitle: 'Create a new board',
            editTitle: 'Edit',
            create: 'Create',
            name: 'Name',
            nameRequired: 'Please input the name of board!',
            nameTooLong: 'Max length of name is 48',
            duplicate: (name: string): string => `Board "${name}" already exists`,
            edit: 'Edit',
            preview: 'Preview',
        },
        list: {
            focused: 'Focused List',
            done: 'Done List',
            cardCount: (count: number): string => `${count} ${plural(count, 'Card', 'Cards')}`,
        },
        cardEditor: {
            createTitle: 'Create a new card',
            editTitle: 'Edit',
            titleRequired: 'Please input the title of card!',
            title: 'Title',
            description: 'Description',
            estimatedTime: 'Estimated Time In Hour',
            actualTime: 'Actual Time In Hour',
            actualSpentTime: 'Actual Spent Time In Hour',
            completedTime: 'Completed Time',
            lastCompletedTime: 'Last Completed Time',
            completionPlaceholder: 'Completion time',
            labels: 'Labels',
            edit: 'Edit',
            preview: 'Preview',
            insertLink: 'Insert link',
            insert: 'Insert',
            ctrlEnter: 'Ctrl+Enter',
            checkbox: 'Insert task checkbox - [ ] (Ctrl+L)',
            bold: 'Toggle bold **text** (Ctrl+B)',
            italic: 'Toggle italic *text* (Ctrl+I)',
            strikethrough: 'Toggle strikethrough ~~text~~ (Ctrl+Shift+X)',
            link: 'Insert link [text](URL) (Ctrl+K)',
        },
        card: {
            created: 'Created',
            completed: 'Completed',
            lastCompleted: 'Last completed',
        },
        labelEditor: {
            color: 'Color:',
            remove: 'Remove label',
            namePlaceholder: 'Label name',
        },
        brief: {
            perfect: 'Perfect',
            good: 'Good',
            fair: 'Fair',
            poor: 'Poor',
            bad: 'Bad',
            accuracy: 'Estimate accuracy',
        },
        defaultList: {
            backlog: 'Backlog',
            todo: 'TODO',
            inProgress: 'In Progress',
            done: 'Done',
        },
        demoCard: {
            welcome: 'Welcome✨',
            content:
                'This is a #demo Card 🎈. \n' +
                '## Usage \n\n' +
                '- **Draggable**\n' +
                '- Support **Markdown**\n' +
                '- Click to edit content\n' +
                '- Ctrl+Enter to save card\n' +
                '- Click label to filter card\n' +
                '\n### Try it yourself!\n\n' +
                '[ ] Drag this card to In Progress\n' +
                '[ ] Edit me in Markdown\n' +
                '[ ] Set estimated time',
        },
    },

    history: {
        all: 'All',
        pomodorosToday: 'Pomodoros Today',
        pomodorosThisWeek: 'Pomodoros This Week',
        pomodorosThisMonth: 'Pomodoros This Month',
        loadFailed: (detail: string): string =>
            'Failed to load history data' + (detail ? `: ${detail}` : ''),
        noData: 'No Data',
        projectFilter: 'Set Project Filter',
        allProjects: 'All Projects',
    },

    chart: {
        trend: 'TREND',
        sankey: {
            title: 'Sankey Diagram',
            focused: 'Focused',
            distracted: 'Distracted',
            exitHint: '(Click the background or press Esc to exit)',
        },
        treemap: {
            projects: 'Projects',
            applications: 'Applications',
            others: 'Others',
            projectSeries: 'Project Hours',
            applicationSeries: 'Application Hours',
        },
        badge: {
            spentTime: 'Spent Time',
            extra: 'EXTRA',
            left: 'LEFT',
            extraTime: 'Extra Time',
            leftTime: 'Left Time',
        },
    },

    /** Import validation report (`shared/dataTransfer/validate.ts`). */
    guard: {
        expect: {
            nonEmptyString: 'a non-empty string',
            finiteNumber: 'a finite number',
            stringArray: 'an array of strings',
            array: 'an array',
            object: 'an object',
        },
        describe: {
            null: 'null',
            array: 'an array',
            object: 'an object',
            type: (type: string): string => `a ${type}`,
            emptyStrings: 'an array of empty strings',
            entry: (index: number, found: string): string =>
                `an array whose entry ${index} is ${found}`,
        },
        import: {
            overflow: (count: number): string => `and ${count} more problem(s) not listed`,
            missing: (expectation: string): string => `is missing; ${expectation} is required`,
            mismatch: (expectation: string, found: string): string =>
                `should be ${expectation}, but is ${found}`,
            array: (found: string): string => `should be an array, but is ${found}`,
            object: (found: string): string => `should be an object, but is ${found}`,
            finiteNumber: (found: string): string => `should be a finite number, but is ${found}`,
            fileNotObject: (found: string): string =>
                `the file must contain an object, but it contains ${found}`,
            missingSpentTime: 'is missing; an object with "actual" and "estimated" is required',
            refersToCard: (id: string): string => `refers to card ${id}, which is not in the file`,
            refersToList: (id: string): string => `refers to list ${id}, which is not in the file`,
            moveDropped: (id: string): string =>
                `a move of card ${id} refers to a card that is not in the file; ` +
                'the move will be dropped',
            sessionNotCounted: (id: string): string =>
                `refers to pomodoro ${id}, which is not in the file; ` +
                'its time will not be counted',
        },
        merge: {
            cardRemoved: (id: string): string => `Card ${id} will be removed`,
        },
    },

    settings: {
        /** Accessible name of the section list in `SettingNav`. */
        sectionsLabel: 'Settings sections',
        sections: {
            timer: 'Timer',
            appearance: 'Appearance',
            notification: 'Notifications',
            shortcuts: 'Shortcuts',
            system: 'System',
            about: 'About',
        },
        language: {
            system: 'Follow system',
            /** Language names are written in their own language, in both catalogs. */
            zh: '简体中文',
            en: 'English',
        },
        shortcuts: {
            title: 'Keyboard Shortcuts',
            disclaimer: 'These shortcuts are built into the app and cannot be changed yet.',
            group: {
                navigation: 'Navigation',
                window: 'Window',
                timer: 'Timer',
                kanban: 'Kanban',
                editors: 'Editors',
                statistics: 'Statistics',
            },
            nextTab: 'Switch to the next tab',
            previousTab: 'Switch to the previous tab',
            toggleCompact: 'Toggle compact mode',
            toggleMini: 'Toggle the mini mode',
            quit: 'Quit the app',
            startSession: 'Start or resume the current session',
            pauseSession: 'Pause the current session',
            switchMode: 'Switch between focus and break',
            newBoard: 'Create a new board',
            backToBoardList: 'Go back to the board list or the Timer page',
            searchCards: 'Search cards in the board view',
            saveEditor: 'Save the card or board being edited',
            devTools: 'Open the developer tools',
            closeDiagram: 'Close the fullscreen diagram',
        },
        system: {
            language: 'Language',
            languageHint: 'Applies immediately, including the tray menu and desktop notifications.',
            compactAlwaysOnTop: 'Keep Compact Window Always On Top',
            startup: 'Startup',
            startOnBoot: 'Start On Boot',
            hardwareAcceleration: 'Hardware Acceleration',
            update: 'Update',
            autoUpdate: 'Auto Update',
            checkUpdate: 'Check Update',
            dataManagement: 'Data Management',
            openDataFolder: 'Open Data Folder',
            exportData: 'Export Data',
            importData: 'Import Data',
            deleteAllData: 'Delete All Data',
        },
        timer: {
            focusDuration: 'Focus Duration',
            shortBreak: 'Short Break',
            longBreak: 'Long Break',
            minFinish: 'Minimum Focus Time before Finish',
            minFinishHint:
                'The range follows the focus duration above. ' +
                'Set it to "Any" (0) to allow finishing at any time. ',
            distracting: 'Distracting App Setting',
            any: 'Any',
        },
        appearance: {
            theme: 'Theme',
            switchToTheme: (name: string): string => `Switch to the ${name} theme`,
            followSystem: 'Follow System',
            contentOpacity: 'Content Opacity',
            contentOpacityHint:
                'Fades the title bar and the page, text and icons included. Dialogs and ' +
                'toasts fade with them; the window background has its own slider below and ' +
                'is not affected.',
            backgroundOpacity: 'Background Opacity',
            backgroundOpacityHint:
                'How much of the desktop shows through the window background. Floored above ' +
                'zero so the surface never disappears; the text keeps its own opacity.',
            wallpaper: 'Background Wallpaper',
            wallpaperOpacity: 'Wallpaper Opacity',
            calendarBaseColor: 'Calendar Base Color',
        },
        notification: {
            screenshot: 'Screenshot',
            screenshotHint: 'Takes a screenshot every 5 minutes while a session is running.',
            focusStartWarning: 'Focus Start Warning',
            focusStartWarningHint:
                'Asks for a confirmation before starting a focus session without a project.',
            sessionEnd: 'Session End',
            sessionEndHint:
                'A chime plays when a session finishes. There is no desktop notification: ' +
                'the ending screen takes over the window instead.',
        },
        about: {
            hint: 'A time logger that meets the Pomodoro technique and a kanban board.',
            feedback: 'Feedback',
            githubTitle: 'This project is open-source and hosted on GitHub',
        },
        distracting: {
            title: 'Distracting App Setting',
            regexp: 'RegExp',
            app: 'App',
            appPlaceholder: 'App RegExp',
            titleLabel: 'Title',
            titlePlaceholder: 'Title RegExp',
            remove: 'Remove rule',
            addField: 'Add field',
        },
        footer: {
            openSource: 'Open Source @GitHub',
            version: (version: string): string => `Version v${version}`,
        },
    },

    /**
     * Copy that belongs to the main process: the tray, native dialogs and the
     * update pipeline. The renderer never renders these directly.
     */
    native: {
        tray: {
            open: 'Open',
            quit: 'Quit',
        },
        dialog: {
            migrationTitle: 'Database migration failed',
            migrationBody: (error: string): string =>
                'Pomodoro Logger Enhanced could not migrate the old database.\n\n' +
                'The original .nedb files were left untouched. ' +
                'Please back up the db folder and report this error:\n\n' +
                error,
        },
        fileFilter: {
            json: 'JSON',
            allFiles: 'All Files',
            images: 'Images',
        },
        importNotJson: (detail: string): string =>
            'the file is not valid JSON: ' +
            detail +
            ' (check that the file was not renamed from .json)',
        updater: {
            notPackaged: 'Update check is only available in the installed application',
            notAvailable: (version: string): string =>
                `You are using the latest version (v${version})`,
            artifactsMissing:
                'The release artifacts are still being uploaded, please try again later',
        },
    },

    /**
     * User facing feedback copy.
     *
     * Only the strings that are shared between files, or that describe one flow
     * in several steps (the update pipeline), live here: keeping them together
     * is what makes "same situation -> same wording" enforceable. Whole-screen
     * copy stays next to its screen.
     */
    feedback: {
        /** Cards / kanban board actions. */
        kanban: {
            startFocusing: 'Start Focusing',
            paused: 'Paused',
            labelExists: 'Label already exists',
            cannotDeleteList: 'Cannot delete the focused / done list.',
        },
        /** Timer actions. */
        timer: {
            /**
             * A mode switch was asked for while a session is in the way (Tab or
             * the work/rest icon). Both the reason and the way out depend on
             * the state: a running session has to be paused or stopped first, a
             * paused one continued or stopped.
             */
            cannotSwitchMode: (isFocusing: boolean, isRunning: boolean): string =>
                `Cannot switch mode while a ${isFocusing ? 'focus session' : 'break'} is ` +
                `${isRunning ? 'running' : 'paused'} — ${isRunning ? 'pause' : 'continue'} or ` +
                'stop it first.',
            /**
             * A focus session was finished before the configured minimum
             * (`Setting.minFinishDuration`, adjustable on the settings page) had
             * passed. The number travels with the toast so the wording can never
             * promise a different time than the guard enforces.
             */
            finishTooEarly: (minMinutes: number): string =>
                `Focus at least for ${minMinutes} ${plural(minMinutes, 'minute', 'minutes')} to finish`,
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
            dataRemoved:
                'All user data is removed. Your settings are kept. Pomodoro needs to restart.',
            openDataDirFailed: 'Could Not Open Data Folder',
            openDataDirFailedDetail: (reason: string): string =>
                `The data folder could not be opened: ${reason}`,
            importConfirm: 'Pomodoro Logger Enhanced will restart after importing. Continue?',
            deleteAllConfirm: 'Delete all sessions, projects and boards? Your settings are kept.',
            /** Export / import results, and the report of a refused file. */
            exportDone: (fileName: string): string => `Data exported to ${fileName}`,
            exportFailed: 'Export Failed',
            exportFailedDetail: (reason: string): string =>
                `The data could not be exported: ${reason}`,
            importInvalidTitle: 'This file cannot be imported',
            importInvalidIntro:
                'Nothing was imported and your current data was left untouched. ' +
                'Fix the problems below in the file, then import it again:',
            importWarningTitle: 'Imported with warnings',
            importWarningIntro: 'The data was imported, but some entries had to be adjusted:',
            importDone: 'Data imported. Restarting…',
            importFailed: 'Import Failed',
            importFailedDetail: (reason: string): string =>
                `The data could not be imported: ${reason}`,
        },
        /**
         * The update pipeline: check -> download -> install. Every step reports
         * through the same channels (`toast` for the check result, `notice` for
         * the background phases, `confirm`/`alert` for the two decisions).
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
            failed: (phase: string): string => `Update ${phase} Failed`,
            phase: {
                check: 'Check',
                download: 'Download',
                install: 'Install',
            },
            versionLabel: 'Version',
            manualDownloadHint: 'You can download manually from ',
            checkFailed: (detail: string): string => `Failed to check for update: ${detail}`,
        },
    },
};
