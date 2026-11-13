import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TimerActionTypes, TimerState } from '../Timer/action';
import styled from 'styled-components';
import { GithubOutlined } from '@ant-design/icons';
import { Button, Slider, Switch } from 'antd';
import { deleteAllUserData } from '../../monitor/sessionManager';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { DistractingListModalButton } from './DistractingList';
import { isShallowEqualByKeys } from '../../utils';
import pkg from '../../../../package.json';
import type { ExportResult, ImportResult, UpdateErrorPayload } from '../../../main/ipc/type';
import type { DataIssuesReport, DataRepairResult } from '../../../shared/dataRepair';
import type { ImportSummary } from '../../../shared/dataTransfer/importSummary';
import { refreshDbs } from '../../dbs';
import { BUILTIN_THEMES, ThemeDefinition } from '../../theme/tokens';
import SettingNav from './SettingNav';
import PreviewSlider from './PreviewSlider';
import { DEFAULT_SECTION, SectionId, SHORTCUTS } from './sections';
import { DataRepairDialog } from './DataRepairDialog';
import { ImportReportDialog } from './ImportReportDialog';
import { useSliderChange } from './useSliderChange';
import { isScreenshotAvailable } from '../../screenshotSupport';
import { t, useI18n } from '../../i18n';
import type { LanguagePreference, PlainMessageKey } from '../../../shared/i18n';
import type { LogLevel } from '../../../shared/log';

/**
 * The settings page is split into the groups listed in `sections.ts` and driven
 * by the secondary navigation on the left. Only the active group is mounted, so
 * the page no longer scrolls through every option at once.
 */
const Container = styled.div`
    display: flex;
    align-items: stretch;
    height: calc(100vh - 44px);
    color: var(--pl-text);
    -webkit-app-region: no-drag;
`;

const Pane = styled.div`
    flex: 1 1 auto;
    min-width: 0;
    /* The bottom padding leaves room for the fixed footer, which spans the
       whole settings page and would otherwise cover the last option. */
    padding: 12px 36px 72px 12px;
    overflow-y: auto;
`;

/**
 * One option of the active section. The bottom border is the separator the
 * page uses between options; it is dropped on the last one so the group does
 * not end on a stray line.
 */
const Field = styled.div`
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--pl-border);

    &:last-child {
        border-bottom: none;
        margin-bottom: 0;
    }
`;

const SliderContainer = styled.div`
    padding: 4px 24px;
    -webkit-app-region: no-drag;
    pointer-events: auto;
`;

const ButtonWrapper = styled.div`
    margin: 0.6em;
`;

const ColorInput = styled.input`
    width: 32px;
    height: 32px;
    margin: 8px;
    padding: 0;
    border: none;
    border-radius: 2px;
    background: none;
    cursor: pointer;
    vertical-align: middle;

    &::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    &::-webkit-color-swatch {
        border: 1px solid var(--pl-border);
        border-radius: 2px;
    }
`;

/**
 * Pinned to the bottom of the settings page, as it was before the page was
 * split into sections: the version and the repository link are page chrome,
 * not an option of any single section, so it shows on all of them.
 */
const Footer = styled.footer`
    border-top: 1px solid var(--pl-border);
    padding: 0.6rem 0;
    position: fixed;
    bottom: 0;
    left: 0;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
    padding-left: 180px;
    text-align: center;
    color: var(--pl-text-secondary);
`;

/** Key combination badge of the read-only shortcut table. */
const ShortcutKey = styled.kbd`
    display: inline-block;
    min-width: 20px;
    padding: 1px 6px;
    border: 1px solid var(--pl-border);
    border-radius: 4px;
    background-color: var(--pl-bg-elevated);
    color: var(--pl-text);
    font-family: inherit;
    font-size: 12px;
    text-align: center;
    white-space: nowrap;
`;

const ShortcutGroup = styled.div`
    margin-bottom: 16px;

    h5 {
        margin: 0 0 6px;
        font-size: 13px;
        color: var(--pl-text-secondary);
    }
`;

const ShortcutRow = styled.div`
    display: flex;
    align-items: baseline;
    padding: 4px 0;
    font-size: 13px;
`;

const ShortcutKeys = styled.div`
    flex: 0 0 190px;
`;

const Hint = styled.p`
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const StyledIcon = styled(GithubOutlined)`
    font-size: 1.25rem;
    color: var(--pl-text);
    transition: color 0.1s;
    margin: 0 0.3rem;
    &:hover {
        color: var(--pl-primary);
    }
`;

const ThemeOptions = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin: 4px 0 4px 0;
`;

interface ThemeButtonProps {
    $active: boolean;
}

const ThemeButton = styled.button<ThemeButtonProps>`
    display: flex;
    align-items: center;
    padding: 6px 12px;
    margin: 4px 8px 4px 0;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition:
        border-color 0.15s,
        color 0.15s,
        background-color 0.15s;
    background-color: ${({ $active }) =>
        $active ? 'var(--pl-bg-hover)' : 'var(--pl-bg-elevated)'};
    border: 1px solid ${({ $active }) => ($active ? 'var(--pl-primary)' : 'var(--pl-border)')};
    color: ${({ $active }) => ($active ? 'var(--pl-primary)' : 'var(--pl-text)')};

    &:hover {
        border-color: var(--pl-primary);
    }
`;

const Swatches = styled.span`
    display: inline-flex;
    margin-right: 8px;
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid var(--pl-border);

    i {
        display: block;
        width: 12px;
        height: 14px;
    }
`;

/**
 * The body of the import report dialogs: a one line explanation of what
 * happened, then every finding as `path: message`.
 *
 * The path is rendered in a monospace face on its own line, because it is the
 * part the user has to match against their file -- it is a JSON path, so it is
 * copyable, and it is what makes a long list scannable instead of a wall of
 * prose.
 */
const IssueList = styled.ul`
    max-height: 220px;
    margin: 8px 0 0;
    padding: 0 4px 0 0;
    overflow-y: auto;
    list-style: none;
    font-size: 12px;
    text-align: left;
`;

const Issue = styled.li`
    margin-bottom: 8px;
    word-break: break-word;

    &:last-child {
        margin-bottom: 0;
    }
`;

const IssuePath = styled.code`
    display: block;
    margin-bottom: 2px;
    color: var(--pl-primary);
    font-size: 12px;
`;

const IssueFooter = styled.div`
    margin-top: 12px;
    color: var(--pl-text-secondary);
    font-size: 13px;
`;

interface IssueReportProps {
    intro: string;
    items: { path: string; message: string }[];
    /** Closing line, e.g. where the complete list was written. */
    footer?: string;
}

/**
 * Renders one list of findings for both the "this file is wrong" and the
 * "this file was adjusted" dialogs: the two differ only in their wording and
 * severity, which the copy around them carries.
 */
const IssueReport: React.FunctionComponent<IssueReportProps> = ({ intro, items, footer }) => (
    <div>
        <div>{intro}</div>
        <IssueList>
            {items.map((item, i) => (
                <Issue key={`${item.path}-${i}`}>
                    {item.path && <IssuePath>{item.path}</IssuePath>}
                    <span>{item.message}</span>
                </Issue>
            ))}
        </IssueList>
        {footer && <IssueFooter>{footer}</IssueFooter>}
    </div>
);

/**
 * Opens the folder that holds `data.log`, `crash.log` and friends.
 *
 * Every dialog that says "the details were logged" carries this button, so the
 * claim can be acted on without hunting through the settings page.
 */
const OpenLogFolderButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <Button size="small" onClick={onClick}>
        {t('settings.system.openLogFolder')}
    </Button>
);

const SettingLabel = styled.span`
    font-weight: 500;
    font-size: 14px;
    color: var(--pl-text);
`;

const marks = {
    25: '25min',
    35: '35min',
    45: '45min',
};

const wallpaperOpacityMarks = {
    10: '10%',
    40: '40%',
    70: '70%',
    100: '100%',
};

const DEFAULT_CALENDAR_BASE_COLOR = '#aceebb';

const restMarks = {
    5: '5min',
    10: '10min',
    15: '15min',
};

const longBreakMarks = {
    5: '5min',
    15: '15min',
    25: '25min',
};

/**
 * Marks of the "minimum focus time before Finish" slider, built for the
 * maximum of the current range -- the focus duration in minutes (see the
 * option below). `0` is the stop giving the guard any weight at all (finish
 * at any time), which the hint of the option spells out -- the mark itself
 * stays short.
 */
function minFinishMarks(maxMinutes: number) {
    const marks: { [minutes: number]: string } = { 0: t('settings.timer.any') };
    for (let minutes = 10; minutes < maxMinutes; minutes += 10) {
        marks[minutes] = `${minutes}min`;
    }

    marks[maxMinutes] = `${maxMinutes}min`;
    return marks;
}

const opacityMarks = {
    10: '10%',
    40: '40%',
    70: '70%',
    100: '100%',
};

const themeBackgroundOpacityMarks = {
    10: '10%',
    40: '40%',
    70: '70%',
    100: '100%',
};

const settingUiStates = [
    'focusDuration',
    'restDuration',
    'autoUpdate',
    'longBreakDuration',
    'minFinishDuration',
    'monitorInterval',
    'screenShotInterval',
    'warnBeforeFocusStart',
    'useHardwareAcceleration',
    'unloadOnCloseToTray',
    'compactAlwaysOnTop',
    'contentOpacity',
    'themeBackgroundOpacity',
    'logLevel',
    'wallpaperPath',
    'wallpaperOpacity',
    'startOnBoot',
    'distractingList',
    'calendarBaseColor',
    'themeId',
    'followSystemTheme',
    'customThemes',
    'language',
];

/** The three states of the language option, in the order they are shown. */
const LANGUAGE_OPTIONS: { value: LanguagePreference; labelKey: PlainMessageKey }[] = [
    { value: 'system', labelKey: 'settings.language.system' },
    { value: 'zh', labelKey: 'settings.language.zh' },
    { value: 'en', labelKey: 'settings.language.en' },
];

/** Ordered loudest-last, matching `LOG_LEVELS`. */
const LOG_LEVEL_OPTIONS: { value: LogLevel; labelKey: PlainMessageKey }[] = [
    { value: 'debug', labelKey: 'settings.system.logLevelDebug' },
    { value: 'info', labelKey: 'settings.system.logLevelInfo' },
    { value: 'warn', labelKey: 'settings.system.logLevelWarn' },
    { value: 'error', labelKey: 'settings.system.logLevelError' },
];

const EMPTY_DATA_REPORT: DataIssuesReport = {
    detachedCards: [],
    orphanCards: [],
    lists: [],
    moves: { total: 0, cardCount: 0 },
    dangling: [],
};

const isEmptyDataReport = (report: DataIssuesReport): boolean =>
    report.detachedCards.length === 0 &&
    report.orphanCards.length === 0 &&
    report.lists.length === 0 &&
    report.moves.total === 0 &&
    report.dangling.length === 0;

interface Props extends TimerState, TimerActionTypes {
    /** Applies the data check's result to `kanban.cards` / `lists` / `boards`. */
    applyRepair: (result: DataRepairResult) => void;
    /**
     * Re-reads the kanban tree and the session-derived views. Import and
     * "delete all" write straight to the database, so the store has to catch
     * up without a restart.
     */
    reloadDataStore: () => Promise<void>;
}
export const Setting: React.FunctionComponent<Props> = React.memo(
    (props: Props) => {
        const {
            applyRepair,
            reloadDataStore,
            followSystemTheme,
            setAutoUpdate,
            setCalendarBaseColor,
            setContentOpacity,
            setThemeBackgroundOpacity,
            setWallpaperOpacity,
            setFocusDuration,
            setFollowSystemTheme,
            setLongBreakDuration,
            setMinFinishDuration,
            setRestDuration,
            setScreenShotInterval,
            setStartOnBoot: setStartOnBootAction,
            setThemeId,
            setUseHardwareAcceleration: setUseHardwareAccelerationAction,
            setUnloadOnCloseToTray: setUnloadOnCloseToTrayAction,
            setWallpaperPath,
            setWarnBeforeFocusStart,
        } = props;
        // Subscribes this component to language changes even though the
        // `React.memo` comparator below would otherwise bail out (`language`
        // is in `settingUiStates`, the hook is the belt to that suspender).
        const { t } = useI18n();
        const [importing, setImporting] = useState(false);
        const [exporting, setExporting] = useState(false);
        const [checking, setChecking] = useState(false);
        const [report, setReport] = useState<DataIssuesReport | undefined>();
        const [repairOpen, setRepairOpen] = useState(false);
        const [importSummary, setImportSummary] = useState<ImportSummary | undefined>();
        const [importReportOpen, setImportReportOpen] = useState(false);
        const onChangeFocus = React.useCallback(
            (v: number | [number, number]) => {
                if (v instanceof Array) {
                    return;
                }

                setFocusDuration(v * 60);
            },
            [setFocusDuration]
        );

        const onChangeRest = React.useCallback(
            (v: number | [number, number]) => {
                if (v instanceof Array) {
                    return;
                }

                setRestDuration(v * 60);
            },
            [setRestDuration]
        );

        const onChangeLongBreak = React.useCallback(
            (v: number | [number, number]) => {
                if (v instanceof Array) {
                    return;
                }

                setLongBreakDuration(v * 60);
            },
            [setLongBreakDuration]
        );

        const onChangeMinFinish = React.useCallback(
            (v: number | [number, number]) => {
                if (v instanceof Array) {
                    return;
                }

                // The slider works in minutes, the setting is kept in seconds like
                // every other duration of the timer.
                setMinFinishDuration(v * 60);
            },
            [setMinFinishDuration]
        );

        // The minimum can never be longer than the focus session it guards:
        // a longer one could not be reached before the session ends by itself.
        // The slider therefore follows the focus duration above it, and shows
        // the effective value (`effectiveMinFinishDuration` in
        // Timer/sessionState.ts clamps the same way on read) -- the stored
        // setting is left alone, so a longer one applies again once the focus
        // duration allows it.
        const minFinishMaxMinutes = Math.max(1, Math.floor(props.focusDuration / 60));

        const onChangeContentOpacity = React.useCallback(
            (v: number) => {
                setContentOpacity(v / 100);
            },
            [setContentOpacity]
        );

        const onChangeThemeBackgroundOpacity = React.useCallback(
            (v: number) => {
                setThemeBackgroundOpacity(v / 100);
            },
            [setThemeBackgroundOpacity]
        );

        const onChangeWallpaperOpacity = React.useCallback(
            (v: number) => {
                setWallpaperOpacity(v / 100);
            },
            [setWallpaperOpacity]
        );

        // Dragging reports a value per pointer event, far more often than a
        // screen can show one: these fold that burst into one change per frame
        // (see `useSliderChange`). Only the value travels this way -- what each
        // slider *saves* is decided in its action. The durations do not need
        // this at all: they are committed once per drag by `PreviewSlider`.
        const [queueContentOpacityChange] = useSliderChange(onChangeContentOpacity);
        const [queueThemeBackgroundOpacityChange] = useSliderChange(onChangeThemeBackgroundOpacity);
        const [queueWallpaperOpacityChange] = useSliderChange(onChangeWallpaperOpacity);

        const switchScreenshot = React.useCallback(
            (v: boolean) => {
                if (v) {
                    setScreenShotInterval(1000 * 60 * 5);
                } else {
                    setScreenShotInterval(undefined);
                }

                feedback.notice({
                    kind: 'warning',
                    title: FEEDBACK_MESSAGES.setting.restartToApply,
                    description: FEEDBACK_MESSAGES.setting.screenshotRestart,
                });
            },
            [setScreenShotInterval]
        );

        const switchAutoUpdate = React.useCallback(
            (v: boolean) => {
                setAutoUpdate(v);
            },
            [setAutoUpdate]
        );

        const [checkingUpdate, setCheckingUpdate] = useState(false);
        // Everything `onCheckUpdate` registers lives here rather than in its
        // closure, so the cleanup can also run from the unmount effect below.
        const checkUpdateRef = useRef<{ timeout?: any; unsubscribers: Array<() => void> }>({
            unsubscribers: [],
        });
        const releaseCheckUpdate = useCallback(() => {
            const current = checkUpdateRef.current;
            clearTimeout(current.timeout);
            current.timeout = undefined;
            for (const unsubscribe of current.unsubscribers) {
                unsubscribe();
            }
            current.unsubscribers = [];
        }, []);

        // Leaving the page has to release a check that is still in flight.
        useEffect(() => releaseCheckUpdate, [releaseCheckUpdate]);

        const onCheckUpdate = useCallback(() => {
            setCheckingUpdate(true);
            // The main process answers with one of the three events below; the timeout
            // is only a safety net so the button never gets stuck in loading state.
            // Both the listeners and the timeout belong to the page, not to this
            // closure: they are released on a result, on a second click and on
            // unmount (see `releaseCheckUpdate`), so a check still in flight can
            // never leave three listeners behind or call `setCheckingUpdate` on
            // an unmounted component.
            releaseCheckUpdate();
            const onResult = () => {
                releaseCheckUpdate();
                setCheckingUpdate(false);
            };
            const onAvailable = () => onResult();
            const onNotAvailable = (info: string) => {
                // Receipt of the check: a toast, not a dialog. "You are on the
                // latest version" does not need an acknowledgement.
                feedback.toast({ kind: 'info', content: info });
                onResult();
            };
            const onError = (payload: UpdateErrorPayload) => {
                feedback.toast({
                    kind: 'error',
                    content: FEEDBACK_MESSAGES.update.checkFailed(
                        String(payload?.message ?? payload)
                    ),
                });
                onResult();
            };
            const current = checkUpdateRef.current;
            current.unsubscribers.push(
                window.api.onUpdateAvailable(onAvailable),
                window.api.onUpdateNotAvailable(onNotAvailable),
                window.api.onUpdateError(onError)
            );
            current.timeout = setTimeout(onResult, 30000);
            window.api.checkUpdate();
        }, [releaseCheckUpdate]);

        const setStartOnBoot = React.useCallback(
            (v: boolean) => {
                setStartOnBootAction(v);
                window.api.openAtLogin(v);
            },
            [setStartOnBootAction]
        );

        const setUseHardwareAcceleration = useCallback(
            (v: boolean) => {
                setUseHardwareAccelerationAction(v);
                feedback.notice({
                    kind: 'warning',
                    title: FEEDBACK_MESSAGES.setting.restartToApply,
                    description: FEEDBACK_MESSAGES.setting.hardwareAccelerationRestart,
                });
            },
            [setUseHardwareAccelerationAction]
        );

        // antd's Switch hands the click event to `onChange` as a second
        // argument; the action takes the boolean only.
        const setUnloadOnCloseToTray = useCallback(
            (v: boolean) => {
                setUnloadOnCloseToTrayAction(v);
            },
            [setUnloadOnCloseToTrayAction]
        );

        const setCalendarColor = useCallback(
            (v: string) => {
                setCalendarBaseColor(v);
            },
            [setCalendarBaseColor]
        );

        const onToggleFocusStartWarning = useCallback(
            (v: boolean) => {
                setWarnBeforeFocusStart(v);
            },
            [setWarnBeforeFocusStart]
        );

        const resetCalendarColor = useCallback(() => {
            setCalendarBaseColor(DEFAULT_CALENDAR_BASE_COLOR);
        }, [setCalendarBaseColor]);

        const themes = React.useMemo(
            () => (props.customThemes ? BUILTIN_THEMES.concat(props.customThemes) : BUILTIN_THEMES),
            [props.customThemes]
        );

        const onSelectTheme = useCallback(
            (themeId: string) => {
                setThemeId(themeId);
                // Picking a theme explicitly takes over from the OS preference.
                if (followSystemTheme) {
                    setFollowSystemTheme(false);
                }
            },
            [followSystemTheme, setFollowSystemTheme, setThemeId]
        );

        const onToggleFollowSystem = useCallback(
            (follow: boolean) => {
                setFollowSystemTheme(follow);
            },
            [setFollowSystemTheme]
        );

        const onSelectWallpaper = useCallback(async () => {
            const path = await window.api.selectWallpaper();
            if (path) {
                setWallpaperPath(path);
            }
        }, [setWallpaperPath]);

        const onClearWallpaper = useCallback(() => {
            setWallpaperPath(undefined);
        }, [setWallpaperPath]);

        const onOpenLogDir = useCallback(async () => {
            try {
                await window.api.openLogDir();
            } catch (e) {
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.openLogDirFailed,
                    content: FEEDBACK_MESSAGES.setting.openLogDirFailedDetail(errorText(e)),
                });
            }
        }, []);

        const onOpenDataDir = useCallback(async () => {
            try {
                await window.api.openDataDir();
            } catch (e) {
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.openDataDirFailed,
                    content: FEEDBACK_MESSAGES.setting.openDataDirFailedDetail(errorText(e)),
                });
            }
        }, []);

        /**
         * The scan only reads; the dialog decides what to repair, and the repair
         * command recomputes the affected rows. Keeping the two apart means a
         * pomodoro that finishes while the dialog is open cannot be swept away
         * by a snapshot taken before it existed.
         */
        const onCheckData = useCallback(async () => {
            setChecking(true);
            try {
                const next = await window.api.scanDataIssues();
                setReport(next);
                if (isEmptyDataReport(next)) {
                    feedback.toast({
                        kind: 'info',
                        content: FEEDBACK_MESSAGES.setting.dataCheckNone,
                    });
                    return;
                }
                setRepairOpen(true);
            } catch (e) {
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.dataCheckFailed,
                    content: FEEDBACK_MESSAGES.setting.dataCheckFailedDetail(errorText(e)),
                    actions: <OpenLogFolderButton onClick={onOpenLogDir} />,
                });
            } finally {
                setChecking(false);
            }
        }, [onOpenLogDir]);

        /**
         * A restore or a partial repair changes the set, so the dialog asks for
         * a fresh scan instead of trying to patch its own copy. A failure here
         * is not worth a second dialog: the repair already reported its own.
         */
        const rescanData = useCallback(async () => {
            try {
                setReport(await window.api.scanDataIssues());
            } catch {
                // Keep the previous report; the dialog still shows what it had.
            }
        }, []);

        /**
         * Both destructive flows share this: the dialog tells the user what
         * happens, and the work runs behind its OK button. The promise returned
         * by `onOk` keeps the dialog open with a spinner until the command
         * finishes, then the store is re-read instead of restarting the app.
         */
        const onDeleteConfirm = useCallback(() => {
            feedback.confirm({
                kind: 'error',
                title: FEEDBACK_MESSAGES.setting.deleteAllConfirm,
                content: FEEDBACK_MESSAGES.setting.deleteAllNote,
                okText: t('common.delete'),
                onOk: async () => {
                    try {
                        await deleteAllUserData();
                    } catch (e) {
                        // Resolving keeps the dialog from rejecting into a
                        // global `unhandledrejection`, which would be logged as
                        // a crash it never was.
                        feedback.alert({
                            kind: 'error',
                            title: FEEDBACK_MESSAGES.setting.deleteFailed,
                            content: FEEDBACK_MESSAGES.setting.deleteFailedDetail(errorText(e)),
                            actions: <OpenLogFolderButton onClick={onOpenLogDir} />,
                        });
                        return;
                    }

                    await reloadDataStore();
                    feedback.toast({
                        kind: 'success',
                        content: FEEDBACK_MESSAGES.setting.deleteDone,
                    });
                },
            });
        }, [onOpenLogDir, reloadDataStore, t]);

        /**
         * Reports a refused file: every problem the validator found, each with
         * the path it sits at, so the user can open the file and fix exactly
         * those spots.
         *
         * A dialog rather than a toast, because a list of problems is too long
         * to read in three seconds and the import did not happen -- the user
         * has to acknowledge that before trying again.
         */
        const showImportIssues = useCallback(
            (issues: { path: string; message: string }[]) => {
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.importInvalidTitle,
                    content: (
                        <IssueReport
                            intro={FEEDBACK_MESSAGES.setting.importInvalidIntro}
                            items={issues}
                            footer={FEEDBACK_MESSAGES.setting.importIssuesLogged}
                        />
                    ),
                    okText: t('common.ok'),
                    actions: <OpenLogFolderButton onClick={onOpenLogDir} />,
                });
            },
            [onOpenLogDir, t]
        );

        /**
         * The import either succeeded or was refused; both end in a message.
         * A successful import re-reads the store and, when the merge left
         * anything behind, opens a report that leads into the data check.
         */
        const onImportClick = useCallback(async () => {
            setImporting(true);
            let result: ImportResult;
            try {
                result = await onImportData();
            } catch (e) {
                // A rejection here is an unexpected failure (the main process
                // could not read the file, the merge worker died, the write
                // failed); the validator's own refusals come back as a result.
                setImporting(false);
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.importFailed,
                    content: (
                        <>
                            {FEEDBACK_MESSAGES.setting.importFailedDetail(errorText(e))}
                            <br />
                            {FEEDBACK_MESSAGES.setting.importFailedHint}
                        </>
                    ),
                    actions: <OpenLogFolderButton onClick={onOpenLogDir} />,
                });
                return;
            }

            setImporting(false);

            if (result.status === 'cancelled') {
                return;
            }

            if (result.status === 'invalid') {
                showImportIssues(result.issues);
                return;
            }

            // The import wrote straight to the database, so the store has to be
            // re-read; there is nothing to restart for.
            await reloadDataStore();

            const { counts } = result.summary;
            const needsAttention =
                counts.cardsOutsideLists +
                    counts.deadMoves +
                    counts.danglingSessions +
                    counts.unknownBoard >
                0;

            if (needsAttention) {
                setImportSummary(result.summary);
                setImportReportOpen(true);
                return;
            }

            feedback.toast({
                kind: 'success',
                content: FEEDBACK_MESSAGES.setting.importDone,
            });
        }, [onOpenLogDir, reloadDataStore, showImportIssues]);

        const onExportClick = useCallback(async () => {
            setExporting(true);
            try {
                const result = await onExportData();
                if (result.status === 'written') {
                    feedback.toast({
                        kind: 'success',
                        // The file name carries the export time, so naming it is
                        // also the receipt of *when* the data was taken.
                        content: FEEDBACK_MESSAGES.setting.exportDone(fileNameOf(result.filePath)),
                    });
                }
            } catch (e) {
                feedback.alert({
                    kind: 'error',
                    title: FEEDBACK_MESSAGES.setting.exportFailed,
                    content: FEEDBACK_MESSAGES.setting.exportFailedDetail(errorText(e)),
                });
            }

            setExporting(false);
        }, []);

        // Both operations are destructive/irreversible enough to deserve the
        // blocking dialog instead of an in place popover: the user gets the
        // consequence spelled out in the title of the confirmation.
        const onImportConfirm = useCallback(() => {
            feedback.confirm({
                kind: 'warning',
                title: FEEDBACK_MESSAGES.setting.importConfirm,
                okText: t('common.import'),
                onOk: () => {
                    onImportClick();
                },
            });
        }, [onImportClick, t]);

        const [section, setSection] = useState<SectionId>(DEFAULT_SECTION);
        // Packaged builds do not offer screenshot capture; see
        // `screenshotSupport.ts` for why and for how the stored value is
        // dropped on load.
        const screenshotAvailable = isScreenshotAvailable(window.api?.isPackaged);

        return (
            <Container>
                <SettingNav active={section} onChange={setSection} />
                <Pane>
                    {section === 'timer' && (
                        <>
                            <Field>
                                <h4>{t('settings.timer.focusDuration')}</h4>
                                <SliderContainer>
                                    <PreviewSlider
                                        marks={marks}
                                        step={1}
                                        min={process.env.NODE_ENV === 'production' ? 20 : 2}
                                        max={60}
                                        value={props.focusDuration / 60}
                                        onCommit={onChangeFocus}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.timer.shortBreak')}</h4>
                                <SliderContainer>
                                    <PreviewSlider
                                        marks={restMarks}
                                        step={1}
                                        min={1}
                                        max={20}
                                        value={props.restDuration / 60}
                                        onCommit={onChangeRest}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.timer.longBreak')}</h4>
                                <SliderContainer>
                                    <PreviewSlider
                                        marks={longBreakMarks}
                                        step={1}
                                        min={1}
                                        max={40}
                                        value={props.longBreakDuration / 60}
                                        onCommit={onChangeLongBreak}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.timer.minFinish')}</h4>
                                <Hint>{t('settings.timer.minFinishHint')}</Hint>
                                <SliderContainer>
                                    <PreviewSlider
                                        marks={minFinishMarks(minFinishMaxMinutes)}
                                        step={1}
                                        min={0}
                                        max={minFinishMaxMinutes}
                                        value={
                                            Math.min(props.minFinishDuration, props.focusDuration) /
                                            60
                                        }
                                        onCommit={onChangeMinFinish}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.timer.distracting')}</h4>
                                <ButtonWrapper>
                                    <DistractingListModalButton />
                                </ButtonWrapper>
                            </Field>
                        </>
                    )}

                    {section === 'appearance' && (
                        <>
                            <Field>
                                <h4>{t('settings.appearance.theme')}</h4>
                                <ThemeOptions>
                                    {themes.map((theme: ThemeDefinition) => {
                                        // Built-in theme names are copy; a custom
                                        // theme's name is user data and stays as is.
                                        const name =
                                            theme.id === 'day'
                                                ? t('theme.day')
                                                : theme.id === 'night'
                                                  ? t('theme.night')
                                                  : theme.name;
                                        return (
                                            <ThemeButton
                                                key={theme.id}
                                                $active={
                                                    !props.followSystemTheme &&
                                                    props.themeId === theme.id
                                                }
                                                onClick={() => onSelectTheme(theme.id)}
                                                title={t('settings.appearance.switchToTheme', name)}
                                            >
                                                <Swatches>
                                                    <i
                                                        style={{
                                                            backgroundColor: theme.tokens.bg,
                                                        }}
                                                    />
                                                    <i
                                                        style={{
                                                            backgroundColor:
                                                                theme.tokens.bgElevated,
                                                        }}
                                                    />
                                                    <i
                                                        style={{
                                                            backgroundColor: theme.tokens.primary,
                                                        }}
                                                    />
                                                </Swatches>
                                                {name}
                                            </ThemeButton>
                                        );
                                    })}
                                </ThemeOptions>
                                <SettingLabel>{t('settings.appearance.followSystem')}</SettingLabel>
                                <Switch
                                    onChange={onToggleFollowSystem}
                                    checked={props.followSystemTheme}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>{t('settings.appearance.contentOpacity')}</h4>
                                <Hint>{t('settings.appearance.contentOpacityHint')}</Hint>
                                <SliderContainer>
                                    <Slider
                                        marks={opacityMarks}
                                        min={10}
                                        max={100}
                                        step={5}
                                        value={Math.round(props.contentOpacity * 100)}
                                        onChange={queueContentOpacityChange}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.appearance.backgroundOpacity')}</h4>
                                <Hint>{t('settings.appearance.backgroundOpacityHint')}</Hint>
                                <SliderContainer>
                                    <Slider
                                        marks={themeBackgroundOpacityMarks}
                                        min={10}
                                        max={100}
                                        step={5}
                                        value={Math.round(props.themeBackgroundOpacity * 100)}
                                        onChange={queueThemeBackgroundOpacityChange}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.appearance.wallpaper')}</h4>
                                <Button
                                    size="small"
                                    onClick={onSelectWallpaper}
                                    style={{ margin: 8 }}
                                >
                                    {t('common.choose')}
                                </Button>
                                {props.wallpaperPath && (
                                    <Button size="small" onClick={onClearWallpaper}>
                                        {t('common.clear')}
                                    </Button>
                                )}
                            </Field>

                            <Field>
                                <h4>{t('settings.appearance.wallpaperOpacity')}</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={wallpaperOpacityMarks}
                                        min={10}
                                        max={100}
                                        step={5}
                                        value={Math.round(props.wallpaperOpacity * 100)}
                                        onChange={queueWallpaperOpacityChange}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>{t('settings.appearance.calendarBaseColor')}</h4>
                                <ColorInput
                                    type="color"
                                    value={props.calendarBaseColor}
                                    onChange={(e) => setCalendarColor(e.target.value)}
                                />
                                <Button size="small" onClick={resetCalendarColor}>
                                    {t('common.reset')}
                                </Button>
                            </Field>
                        </>
                    )}

                    {section === 'notification' && (
                        <>
                            {screenshotAvailable && (
                                <Field>
                                    <h4>{t('settings.notification.screenshot')}</h4>
                                    <Hint>{t('settings.notification.screenshotHint')}</Hint>
                                    <Switch
                                        onChange={switchScreenshot}
                                        checked={!!props.screenShotInterval}
                                        style={{ margin: 8 }}
                                    />
                                </Field>
                            )}

                            <Field>
                                <h4>{t('settings.notification.focusStartWarning')}</h4>
                                <Hint>{t('settings.notification.focusStartWarningHint')}</Hint>
                                <Switch
                                    onChange={onToggleFocusStartWarning}
                                    checked={props.warnBeforeFocusStart}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>{t('settings.notification.sessionEnd')}</h4>
                                <Hint>{t('settings.notification.sessionEndHint')}</Hint>
                            </Field>
                        </>
                    )}

                    {section === 'shortcuts' && (
                        <Field>
                            <h4>{t('settings.shortcuts.title')}</h4>
                            <Hint>{t('settings.shortcuts.disclaimer')}</Hint>
                            {SHORTCUTS.map((group) => (
                                <ShortcutGroup key={group.groupKey}>
                                    <h5>{t(group.groupKey)}</h5>
                                    {group.entries.map((entry) => (
                                        <ShortcutRow key={entry.keys}>
                                            <ShortcutKeys>
                                                <ShortcutKey>{entry.keys}</ShortcutKey>
                                            </ShortcutKeys>
                                            <span>{t(entry.descriptionKey)}</span>
                                        </ShortcutRow>
                                    ))}
                                </ShortcutGroup>
                            ))}
                        </Field>
                    )}

                    {section === 'system' && (
                        <>
                            <Field>
                                <h4>{t('settings.system.language')}</h4>
                                <Hint>{t('settings.system.languageHint')}</Hint>
                                <ThemeOptions
                                    role="group"
                                    aria-label={t('settings.system.language')}
                                >
                                    {LANGUAGE_OPTIONS.map((option) => (
                                        <ThemeButton
                                            key={option.value}
                                            type="button"
                                            $active={props.language === option.value}
                                            aria-pressed={props.language === option.value}
                                            onClick={() => props.setLanguage(option.value)}
                                        >
                                            {t(option.labelKey)}
                                        </ThemeButton>
                                    ))}
                                </ThemeOptions>
                            </Field>

                            <Field>
                                <h4>{t('settings.system.logging')}</h4>
                                <SettingLabel>{t('settings.system.logLevel')}</SettingLabel>
                                <Hint>{t('settings.system.logLevelHint')}</Hint>
                                <ThemeOptions
                                    role="group"
                                    aria-label={t('settings.system.logLevel')}
                                >
                                    {LOG_LEVEL_OPTIONS.map((option) => (
                                        <ThemeButton
                                            key={option.value}
                                            type="button"
                                            $active={props.logLevel === option.value}
                                            aria-pressed={props.logLevel === option.value}
                                            onClick={() => props.setLogLevel(option.value)}
                                        >
                                            {t(option.labelKey)}
                                        </ThemeButton>
                                    ))}
                                </ThemeOptions>
                                <ButtonWrapper>
                                    <Button onClick={onOpenLogDir}>
                                        {t('settings.system.openLogFolder')}
                                    </Button>
                                </ButtonWrapper>
                            </Field>

                            <Field>
                                <SettingLabel>
                                    {t('settings.system.compactAlwaysOnTop')}
                                </SettingLabel>
                                <Switch
                                    onChange={props.setCompactAlwaysOnTop}
                                    checked={props.compactAlwaysOnTop}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>{t('settings.system.startup')}</h4>
                                <SettingLabel>{t('settings.system.startOnBoot')}</SettingLabel>
                                <Switch
                                    onChange={setStartOnBoot}
                                    checked={props.startOnBoot}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <SettingLabel>
                                    {t('settings.system.hardwareAcceleration')}
                                </SettingLabel>
                                <Switch
                                    onChange={setUseHardwareAcceleration}
                                    checked={props.useHardwareAcceleration}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <SettingLabel>
                                    {t('settings.system.unloadOnCloseToTray')}
                                </SettingLabel>
                                <Hint>{t('settings.system.unloadOnCloseToTrayHint')}</Hint>
                                <Switch
                                    onChange={setUnloadOnCloseToTray}
                                    checked={props.unloadOnCloseToTray}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>{t('settings.system.update')}</h4>
                                <SettingLabel>{t('settings.system.autoUpdate')}</SettingLabel>
                                <Switch
                                    onChange={switchAutoUpdate}
                                    checked={props.autoUpdate}
                                    style={{ margin: 8 }}
                                />
                                <Button
                                    size="small"
                                    loading={checkingUpdate}
                                    onClick={onCheckUpdate}
                                >
                                    {t('settings.system.checkUpdate')}
                                </Button>
                            </Field>

                            <Field>
                                <h4>{t('settings.system.dataManagement')}</h4>
                                <ButtonWrapper>
                                    <Button onClick={onOpenDataDir}>
                                        {t('settings.system.openDataFolder')}
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button onClick={onExportClick} loading={exporting}>
                                        {t('settings.system.exportData')}
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button loading={importing} onClick={onImportConfirm}>
                                        {t('settings.system.importData')}
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button loading={checking} onClick={onCheckData}>
                                        {t('settings.system.checkData')}
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button danger={true} onClick={onDeleteConfirm}>
                                        {t('settings.system.deleteAllData')}
                                    </Button>
                                </ButtonWrapper>
                            </Field>
                        </>
                    )}

                    {section === 'about' && (
                        <Field>
                            <h4>{t('app.title')}</h4>
                            <Hint>{t('settings.about.hint')}</Hint>
                            <ButtonWrapper>
                                <Button onClick={openIssuePage}>
                                    {t('settings.about.feedback')}
                                </Button>
                            </ButtonWrapper>
                        </Field>
                    )}
                </Pane>
                <Footer>
                    {t('settings.footer.openSource')}
                    <StyledIcon
                        onClick={openGithubPage}
                        aria-label="GitHub"
                        title={t('settings.about.githubTitle')}
                    />
                    {t('settings.footer.version', pkg.version)}
                </Footer>
                <DataRepairDialog
                    open={repairOpen}
                    report={report ?? EMPTY_DATA_REPORT}
                    onClose={() => setRepairOpen(false)}
                    onRescan={rescanData}
                    applyRepair={applyRepair}
                />
                <ImportReportDialog
                    open={importReportOpen}
                    summary={importSummary}
                    onClose={() => setImportReportOpen(false)}
                    onOpenLogDir={onOpenLogDir}
                    onCheckData={() => {
                        setImportReportOpen(false);
                        onCheckData();
                    }}
                />
            </Container>
        );
    },
    (prevProps, nextProps) => {
        return isShallowEqualByKeys(prevProps, nextProps, settingUiStates);
    }
);

async function onExportData(): Promise<ExportResult> {
    // The databases live in the main process; refreshing first makes sure the
    // export sees what the app just wrote instead of a cached copy.
    await refreshDbs();
    return await window.api.exportData();
}

async function onImportData(): Promise<ImportResult> {
    await refreshDbs();
    return await window.api.importData();
}

/**
 * Restarts the app so the imported data is what the UI reads from now on.
 * Deliberately a plain event: in development the main process only logs it,
 * which is what makes the whole import flow testable without killing the
 * window mid-assertion.
 */
/** The rejection of an IPC call is whatever the main process threw: a string. */
function errorText(e: any): string {
    return typeof e === 'string' ? e : (e?.message ?? String(e));
}

/** `C:\Users\me\Downloads\pomodoro-logger-data-...json` -> the file name. */
function fileNameOf(filePath: string): string {
    const parts = filePath.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}

function openIssuePage() {
    window.api.openExternal('https://github.com/NightZed/PomodoroLogger-Enhanced/issues/new');
}

function openGithubPage() {
    window.api.openExternal('https://github.com/NightZed/PomodoroLogger-Enhanced');
}
