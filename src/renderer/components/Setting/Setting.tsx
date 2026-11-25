import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TimerActionTypes, TimerState } from '../Timer/action';
import styled from 'styled-components';
import { GithubOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { Hint } from '../../../components/common/Hint/Hint';
import { deleteAllUserData } from '../../monitor/sessionManager';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { DistractingListModalButton } from './DistractingList';
import { isShallowEqualByKeys } from '../../utils';
import { TITLE_BAR_HEIGHT } from '../AppTitleBar/tokens';
import { ISSUES_URL } from '../../../shared/links';
import pkg from '../../../../package.json';
import type { ExportResult, ImportResult, UpdateErrorPayload } from '../../../main/ipc/type';
import type { DataIssuesReport, DataRepairResult } from '../../../shared/dataRepair';
import type { ImportSummary } from '../../../shared/dataTransfer/importSummary';
import { refreshDbs } from '../../dbs';
import type { ThemeDefinition } from '../../theme/tokens';
import SettingNav from './SettingNav';
import PreviewSlider from './PreviewSlider';
import { KeyBadge } from './KeyBadge';
import { DEFAULT_SECTION, SectionId, SHORTCUTS } from './sections';
import { DataRepairDialog } from './DataRepairDialog';
import { AppHoursCalibrationDialog } from './AppHoursCalibrationDialog';
import { ImportReportDialog } from './ImportReportDialog';
import { useSliderChange } from './useSliderChange';
import Segmented from './Segmented';
import SettingSwitch from './SettingSwitch';
import {
    Card,
    ControlCluster,
    GroupTitle,
    rowSeparator,
    SettingsContent,
    SettingsRow,
    SettingsSection,
    SliderRow,
} from './layout';
import {
    applyContentOpacity,
    applyThemeBackgroundOpacity,
    applyWallpaperOpacity,
} from '../../theme/opacity';
import { isScreenshotAvailable } from '../../screenshotSupport';
import { playSound, soundName } from '../../sound';
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
    height: calc(100vh - ${TITLE_BAR_HEIGHT}px);
    color: var(--pl-text);
    -webkit-app-region: no-drag;
`;

const Pane = styled.div`
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 40px;
    overflow-y: auto;

    @media (max-width: 980px) {
        padding: 0 24px;
    }

    @media (max-width: 820px) {
        padding: 0 16px;
    }
`;

// The readout of each slider (see `PreviewSlider`). The unit is a fixed label
// rather than translated copy: `min` reads the same in either interface
// language, and keeping it out of the catalog means the editor's suffix never
// changes width between languages. The volume and the three opacities are
// plain percentages.
const formatMinutes = (value: number) => `${value} min`;
const formatPercent = (value: number) => `${value}%`;

const ColorInput = styled.input`
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--pl-border);
    border-radius: 50%;
    background: none;
    cursor: pointer;
    overflow: hidden;

    &::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    &::-webkit-color-swatch {
        border: none;
        border-radius: 50%;
    }
`;

const ShortcutRow = styled.div`
    ${rowSeparator}
    display: flex;
    align-items: center;
    gap: 20px;
    min-height: 40px;
    padding: 7px 16px;
    font-size: 13px;

    @media (max-width: 820px) {
        gap: 12px;
    }
`;

const ShortcutKeys = styled.div`
    flex: 0 0 190px;

    @media (max-width: 820px) {
        flex-basis: 140px;
    }
`;

const ShortcutHeading = styled.h4`
    margin: 20px 4px 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--pl-text-secondary);
`;

const GroupNote = styled.p`
    margin: 0 4px 16px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--pl-text-secondary);
`;

const ThemeOptions = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
`;

interface ThemeButtonProps {
    $active: boolean;
}

const ThemeButton = styled.button<ThemeButtonProps>`
    display: flex;
    align-items: center;
    padding: 5px 9px;
    border-radius: 7px;
    font-family: inherit;
    font-size: 12px;
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

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: 1px;
    }
`;

const Swatches = styled.span`
    display: inline-flex;
    margin-right: 7px;
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid var(--pl-border);

    i {
        display: block;
        width: 10px;
        height: 12px;
    }
`;

const AboutWrap = styled.div`
    max-width: 560px;
    margin: 8px auto 0;
`;

const AboutBody = styled.div`
    padding: 32px 24px;
    text-align: center;
`;

const AboutName = styled.h2`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--pl-text);
`;

const AboutVersion = styled.div`
    margin-top: 6px;
    font-size: 13px;
    color: var(--pl-text-secondary);
`;

const AboutHint = styled.p`
    margin: 12px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--pl-text-secondary);
`;

const AboutActions = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    margin-top: 20px;
`;

const GithubLink = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    color: var(--pl-text);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;

    &:hover {
        color: var(--pl-primary);
    }

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: 2px;
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

const SoundFile = styled.span<{ $disabled: boolean }>`
    display: block;
    font-size: 12px;
    color: var(--pl-text-secondary);
    opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
    word-break: break-all;
`;

interface SoundOptionProps {
    label: string;
    /** Absolute path of the chosen file; `undefined` = the bundled chime. */
    path?: string;
    enabled: boolean;
    volume: number;
    onToggle: (value: boolean) => void;
    onSelect: () => void;
    onRestore: () => void;
}

/**
 * The switch, the three buttons and the file name of one session kind.
 *
 * The switch only silences that kind: the chosen file stays, so turning it
 * back on needs no new trip through the file dialog (the same reason "Reset"
 * removes the path instead of the switch).
 */
const SoundOption: React.FunctionComponent<SoundOptionProps> = ({
    label,
    path,
    enabled,
    volume,
    onToggle,
    onSelect,
    onRestore,
}) => {
    const { t } = useI18n();
    const disabled = !enabled;

    const test = async () => {
        try {
            await playSound(path, volume);
        } catch {
            feedback.toast({
                kind: 'warning',
                content: t(
                    'settings.notification.soundFailed',
                    path ? soundName(path) : t('settings.notification.defaultSound')
                ),
            });
        }
    };

    return (
        <SettingsRow
            title={label}
            description={
                <SoundFile $disabled={disabled}>
                    {path ? soundName(path) : t('settings.notification.defaultSound')}
                </SoundFile>
            }
            control={
                <>
                    <Button
                        size="small"
                        onClick={test}
                        disabled={disabled}
                        aria-label={`${label} ${t('settings.notification.testSound')}`}
                    >
                        {t('settings.notification.testSound')}
                    </Button>
                    <Button
                        size="small"
                        onClick={onSelect}
                        disabled={disabled}
                        aria-label={`${label} ${t('settings.notification.chooseSound')}`}
                    >
                        {t('settings.notification.chooseSound')}
                    </Button>
                    <Button
                        size="small"
                        onClick={onRestore}
                        disabled={disabled || !path}
                        aria-label={`${label} ${t('settings.notification.restoreSound')}`}
                    >
                        {t('settings.notification.restoreSound')}
                    </Button>
                    <SettingSwitch checked={enabled} onChange={onToggle} label={label} />
                </>
            }
        />
    );
};

/*
 * Ticks are passed with a single space instead of an empty label: rc-slider
 * filters out empty labels, so the space is what keeps the mark span (and the
 * dot `PreviewSlider` draws on it) alive. The text itself is hidden by CSS.
 */
const focusMarks = { 25: ' ' };
const restMarks = { 5: ' ' };
const longBreakMarks = { 15: ' ' };
const opacityMarks = { 10: ' ', 40: ' ', 70: ' ', 100: ' ' };
const themeBackgroundOpacityMarks = opacityMarks;
const wallpaperOpacityMarks = opacityMarks;
const volumeMarks = { 0: ' ', 50: ' ', 100: ' ' };

const DEFAULT_CALENDAR_BASE_COLOR = '#aceebb';

const settingUiStates = [
    'focusDuration',
    'restDuration',
    'autoUpdate',
    'longBreakDuration',
    'minFinishDuration',
    'monitorInterval',
    'screenShotInterval',
    'workSoundPath',
    'workSoundEnabled',
    'shortBreakSoundPath',
    'shortBreakSoundEnabled',
    'longBreakSoundPath',
    'longBreakSoundEnabled',
    'soundVolume',
    'desktopNotification',
    'warnBeforeFocusStart',
    'returnToTimerOnSessionEnd',
    'openWindowOnSessionEnd',
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
    appHours: { over: 0, under: 0 },
};

const isEmptyDataReport = (report: DataIssuesReport): boolean =>
    report.detachedCards.length === 0 &&
    report.orphanCards.length === 0 &&
    report.lists.length === 0 &&
    report.moves.total === 0 &&
    report.dangling.length === 0 &&
    (report.appHours?.over ?? 0) === 0 &&
    (report.appHours?.under ?? 0) === 0;

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
            resetSettings,
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
        /**
         * True only for the close that hands over to the calibration dialog:
         * two antd masks overlapping for a frame reads as a flicker.
         */
        const [repairInstantClose, setRepairInstantClose] = useState(false);
        const [hoursOpen, setHoursOpen] = useState(false);
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

        // `PreviewSlider` hands the slider's own unit (0-100) to `onCommit`; the
        // setting is kept as a 0-1 fraction like everywhere else.
        const commitContentOpacity = React.useCallback(
            (v: number) => setContentOpacity(v / 100),
            [setContentOpacity]
        );
        const commitThemeBackgroundOpacity = React.useCallback(
            (v: number) => setThemeBackgroundOpacity(v / 100),
            [setThemeBackgroundOpacity]
        );
        const commitWallpaperOpacity = React.useCallback(
            (v: number) => setWallpaperOpacity(v / 100),
            [setWallpaperOpacity]
        );

        // The three opacity sliders preview straight to the DOM: their value is
        // what the window is showing, so a drag applies it per frame -- but as
        // a CSS custom property write (`theme/opacity.ts`), NOT as a store
        // update. A per-frame store write re-renders every connect()ed
        // component; once a fast drag outruns those renders, react-redux's
        // store check starts scheduling re-renders from inside React's passive
        // effects and trips the nested-update counter
        // ("Maximum update depth exceeded"). The store hears about the drag
        // once, through `onCommit`, and `ThemeController` writes the variable
        // again with the same value.
        const previewContentOpacity = React.useCallback(
            (v: number) => applyContentOpacity(v / 100),
            []
        );
        const previewThemeBackgroundOpacity = React.useCallback(
            (v: number) => applyThemeBackgroundOpacity(v / 100),
            []
        );
        const previewWallpaperOpacity = React.useCallback(
            (v: number) => applyWallpaperOpacity(v / 100),
            []
        );

        // Dragging reports a value per pointer event, far more often than a
        // screen can show one: these fold that burst into one write per frame
        // (see `useSliderChange`). The preview is the only thing traveling this
        // way -- what each slider *saves* is decided by its `onCommit` action.
        const queueContentOpacityPreview = useSliderChange(previewContentOpacity);
        const queueThemeBackgroundOpacityPreview = useSliderChange(previewThemeBackgroundOpacity);
        const queueWallpaperOpacityPreview = useSliderChange(previewWallpaperOpacity);

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
                // A real failure is announced app-wide by `UpdateController`
                // (one persistent notice, keyed) and written to app.log by
                // `AutoUpdater`; repeating it here used to show two messages
                // for the same event. The "not packaged" skip has no app-wide
                // channel, so the page explains that one itself.
                if (payload?.skipped) {
                    feedback.toast({
                        kind: 'info',
                        content: FEEDBACK_MESSAGES.update.checkFailed(
                            String(payload?.message ?? payload)
                        ),
                    });
                }
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

        /**
         * Opens the audio picker for one reminder row. A cancelled dialog
         * leaves the row as it was -- `undefined` is only for an explicit
         * "Reset".
         */
        const chooseSound = useCallback(async (set: (path?: string) => void) => {
            const path = await window.api.selectSound();
            if (path) {
                set(path);
            }
        }, []);

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
                setRepairInstantClose(false);
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
         * Restoring the defaults also clears the custom theme, the wallpaper
         * and the distracting-app list, which the button label cannot convey --
         * "settings" reads as switches and sliders. The confirmation spells
         * those out before anything is touched.
         */
        const onResetConfirm = useCallback(() => {
            feedback.confirm({
                kind: 'warning',
                title: t('settings.reset.confirmTitle'),
                content: t('settings.reset.confirmContent'),
                okText: t('common.reset'),
                onOk: async () => {
                    await resetSettings();
                    feedback.toast({ kind: 'success', content: t('settings.reset.done') });
                },
            });
        }, [resetSettings, t]);

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
                    <SettingsContent>
                        {section === 'timer' && (
                            <>
                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.durations')}</GroupTitle>
                                    <Card>
                                        <SliderRow
                                            title={t('settings.timer.focusDuration')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t('settings.timer.focusDuration')}
                                                    marks={focusMarks}
                                                    step={1}
                                                    min={
                                                        process.env.NODE_ENV === 'production'
                                                            ? 15
                                                            : 2
                                                    }
                                                    max={90}
                                                    value={props.focusDuration / 60}
                                                    formatValue={formatMinutes}
                                                    editUnit="min"
                                                    onCommit={onChangeFocus}
                                                />
                                            }
                                        />
                                        <SliderRow
                                            title={t('settings.timer.shortBreak')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t('settings.timer.shortBreak')}
                                                    marks={restMarks}
                                                    step={1}
                                                    min={1}
                                                    max={90}
                                                    value={props.restDuration / 60}
                                                    formatValue={formatMinutes}
                                                    editUnit="min"
                                                    onCommit={onChangeRest}
                                                />
                                            }
                                        />
                                        <SliderRow
                                            title={t('settings.timer.longBreak')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t('settings.timer.longBreak')}
                                                    marks={longBreakMarks}
                                                    step={1}
                                                    min={1}
                                                    max={90}
                                                    value={props.longBreakDuration / 60}
                                                    formatValue={formatMinutes}
                                                    editUnit="min"
                                                    onCommit={onChangeLongBreak}
                                                />
                                            }
                                        />
                                        <SliderRow
                                            title={t('settings.timer.minFinish')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t('settings.timer.minFinish')}
                                                    step={1}
                                                    min={0}
                                                    max={minFinishMaxMinutes}
                                                    value={
                                                        Math.min(
                                                            props.minFinishDuration,
                                                            props.focusDuration
                                                        ) / 60
                                                    }
                                                    formatValue={formatMinutes}
                                                    editUnit="min"
                                                    onCommit={onChangeMinFinish}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.focus')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.timer.distracting')}
                                            control={
                                                <DistractingListModalButton
                                                    label={t('settings.timer.configure')}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>
                            </>
                        )}

                        {section === 'appearance' && (
                            <>
                                <SettingsSection>
                                    <GroupTitle>{t('settings.appearance.theme')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.appearance.mode')}
                                            control={
                                                <Segmented<string>
                                                    ariaLabel={t('settings.appearance.theme')}
                                                    value={
                                                        props.followSystemTheme
                                                            ? 'system'
                                                            : props.themeId
                                                    }
                                                    options={[
                                                        {
                                                            value: 'system',
                                                            label: t(
                                                                'settings.appearance.followSystem'
                                                            ),
                                                        },
                                                        { value: 'day', label: t('theme.day') },
                                                        { value: 'night', label: t('theme.night') },
                                                    ]}
                                                    onChange={(mode) => {
                                                        if (mode === 'system') {
                                                            onToggleFollowSystem(true);
                                                        } else {
                                                            onSelectTheme(mode);
                                                        }
                                                    }}
                                                />
                                            }
                                        />
                                        {props.customThemes && props.customThemes.length > 0 && (
                                            <SettingsRow
                                                title={t('settings.appearance.customTheme')}
                                                control={
                                                    <ThemeOptions>
                                                        {props.customThemes.map(
                                                            (theme: ThemeDefinition) => (
                                                                <ThemeButton
                                                                    key={theme.id}
                                                                    type="button"
                                                                    $active={
                                                                        !props.followSystemTheme &&
                                                                        props.themeId === theme.id
                                                                    }
                                                                    onClick={() =>
                                                                        onSelectTheme(theme.id)
                                                                    }
                                                                >
                                                                    <Swatches>
                                                                        <i
                                                                            style={{
                                                                                backgroundColor:
                                                                                    theme.tokens.bg,
                                                                            }}
                                                                        />
                                                                        <i
                                                                            style={{
                                                                                backgroundColor:
                                                                                    theme.tokens
                                                                                        .bgElevated,
                                                                            }}
                                                                        />
                                                                        <i
                                                                            style={{
                                                                                backgroundColor:
                                                                                    theme.tokens
                                                                                        .primary,
                                                                            }}
                                                                        />
                                                                    </Swatches>
                                                                    {theme.name}
                                                                </ThemeButton>
                                                            )
                                                        )}
                                                    </ThemeOptions>
                                                }
                                            />
                                        )}
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.transparency')}</GroupTitle>
                                    <Card>
                                        <SliderRow
                                            title={t('settings.appearance.contentOpacity')}
                                            description={t(
                                                'settings.appearance.contentOpacityHint'
                                            )}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t(
                                                        'settings.appearance.contentOpacity'
                                                    )}
                                                    marks={opacityMarks}
                                                    min={10}
                                                    max={100}
                                                    step={5}
                                                    value={Math.round(props.contentOpacity * 100)}
                                                    formatValue={formatPercent}
                                                    editUnit="%"
                                                    onPreview={queueContentOpacityPreview}
                                                    onCommit={commitContentOpacity}
                                                />
                                            }
                                        />
                                        <SliderRow
                                            title={t('settings.appearance.backgroundOpacity')}
                                            description={t(
                                                'settings.appearance.backgroundOpacityHint'
                                            )}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t(
                                                        'settings.appearance.backgroundOpacity'
                                                    )}
                                                    marks={themeBackgroundOpacityMarks}
                                                    min={10}
                                                    max={100}
                                                    step={5}
                                                    value={Math.round(
                                                        props.themeBackgroundOpacity * 100
                                                    )}
                                                    formatValue={formatPercent}
                                                    editUnit="%"
                                                    onPreview={queueThemeBackgroundOpacityPreview}
                                                    onCommit={commitThemeBackgroundOpacity}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.background')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.appearance.wallpaper')}
                                            description={
                                                props.wallpaperPath
                                                    ? fileNameOf(props.wallpaperPath)
                                                    : undefined
                                            }
                                            control={
                                                <>
                                                    <Button
                                                        size="small"
                                                        onClick={onSelectWallpaper}
                                                    >
                                                        {t('common.choose')}
                                                    </Button>
                                                    {props.wallpaperPath && (
                                                        <Button
                                                            size="small"
                                                            onClick={onClearWallpaper}
                                                        >
                                                            {t('common.clear')}
                                                        </Button>
                                                    )}
                                                </>
                                            }
                                        />
                                        <SliderRow
                                            title={t('settings.appearance.wallpaperOpacity')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t(
                                                        'settings.appearance.wallpaperOpacity'
                                                    )}
                                                    marks={wallpaperOpacityMarks}
                                                    min={10}
                                                    max={100}
                                                    step={5}
                                                    value={Math.round(props.wallpaperOpacity * 100)}
                                                    formatValue={formatPercent}
                                                    editUnit="%"
                                                    onPreview={queueWallpaperOpacityPreview}
                                                    onCommit={commitWallpaperOpacity}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.calendar')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.appearance.calendarBaseColor')}
                                            control={
                                                <>
                                                    <ColorInput
                                                        type="color"
                                                        value={props.calendarBaseColor}
                                                        aria-label={t(
                                                            'settings.appearance.calendarBaseColor'
                                                        )}
                                                        onChange={(e) =>
                                                            setCalendarColor(e.target.value)
                                                        }
                                                    />
                                                    <Button
                                                        size="small"
                                                        onClick={resetCalendarColor}
                                                    >
                                                        {t('common.reset')}
                                                    </Button>
                                                </>
                                            }
                                        />
                                    </Card>
                                </SettingsSection>
                            </>
                        )}

                        {section === 'notification' && (
                            <>
                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.alerts')}</GroupTitle>
                                    <Card>
                                        {screenshotAvailable && (
                                            <SettingsRow
                                                title={t('settings.notification.screenshot')}
                                                description={t(
                                                    'settings.notification.screenshotHint'
                                                )}
                                                control={
                                                    <SettingSwitch
                                                        checked={!!props.screenShotInterval}
                                                        onChange={switchScreenshot}
                                                        label={t(
                                                            'settings.notification.screenshot'
                                                        )}
                                                    />
                                                }
                                            />
                                        )}
                                        <SettingsRow
                                            title={t('settings.notification.focusStartWarning')}
                                            description={t(
                                                'settings.notification.focusStartWarningHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.warnBeforeFocusStart}
                                                    onChange={onToggleFocusStartWarning}
                                                    label={t(
                                                        'settings.notification.focusStartWarning'
                                                    )}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.notification.audio')}</GroupTitle>
                                    <Card>
                                        <SoundOption
                                            label={t('settings.notification.workSound')}
                                            path={props.workSoundPath}
                                            enabled={props.workSoundEnabled}
                                            volume={props.soundVolume}
                                            onToggle={props.setWorkSoundEnabled}
                                            onSelect={() => chooseSound(props.setWorkSoundPath)}
                                            onRestore={() => props.setWorkSoundPath(undefined)}
                                        />
                                        <SoundOption
                                            label={t('settings.notification.shortBreakSound')}
                                            path={props.shortBreakSoundPath}
                                            enabled={props.shortBreakSoundEnabled}
                                            volume={props.soundVolume}
                                            onToggle={props.setShortBreakSoundEnabled}
                                            onSelect={() =>
                                                chooseSound(props.setShortBreakSoundPath)
                                            }
                                            onRestore={() =>
                                                props.setShortBreakSoundPath(undefined)
                                            }
                                        />
                                        <SoundOption
                                            label={t('settings.notification.longBreakSound')}
                                            path={props.longBreakSoundPath}
                                            enabled={props.longBreakSoundEnabled}
                                            volume={props.soundVolume}
                                            onToggle={props.setLongBreakSoundEnabled}
                                            onSelect={() =>
                                                chooseSound(props.setLongBreakSoundPath)
                                            }
                                            onRestore={() => props.setLongBreakSoundPath(undefined)}
                                        />
                                        <SliderRow
                                            title={t('settings.notification.volume')}
                                            control={
                                                <PreviewSlider
                                                    ariaLabel={t('settings.notification.volume')}
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={Math.round(props.soundVolume * 100)}
                                                    marks={volumeMarks}
                                                    formatValue={formatPercent}
                                                    editUnit="%"
                                                    onCommit={(v) => props.setSoundVolume(v / 100)}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.notification.desktop')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.notification.desktopNotification')}
                                            description={t(
                                                'settings.notification.desktopNotificationHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.desktopNotification}
                                                    onChange={(value) =>
                                                        props.setDesktopNotification(value)
                                                    }
                                                    label={t(
                                                        'settings.notification.desktopNotification'
                                                    )}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t(
                                                'settings.notification.returnToTimerOnSessionEnd'
                                            )}
                                            description={t(
                                                'settings.notification.returnToTimerOnSessionEndHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.returnToTimerOnSessionEnd}
                                                    onChange={(value) =>
                                                        props.setReturnToTimerOnSessionEnd(value)
                                                    }
                                                    label={t(
                                                        'settings.notification.returnToTimerOnSessionEnd'
                                                    )}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t(
                                                'settings.notification.openWindowOnSessionEnd'
                                            )}
                                            description={t(
                                                'settings.notification.openWindowOnSessionEndHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.openWindowOnSessionEnd}
                                                    onChange={(value) =>
                                                        props.setOpenWindowOnSessionEnd(value)
                                                    }
                                                    label={t(
                                                        'settings.notification.openWindowOnSessionEnd'
                                                    )}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>
                            </>
                        )}

                        {section === 'shortcuts' && (
                            <>
                                <SettingsSection>
                                    <GroupTitle>{t('settings.shortcuts.title')}</GroupTitle>
                                    <GroupNote>{t('settings.shortcuts.disclaimer')}</GroupNote>
                                </SettingsSection>
                                {SHORTCUTS.map((group) => (
                                    <SettingsSection key={group.groupKey}>
                                        <ShortcutHeading>{t(group.groupKey)}</ShortcutHeading>
                                        <Card>
                                            {group.entries.map((entry) => (
                                                <ShortcutRow key={entry.keys}>
                                                    <ShortcutKeys>
                                                        <KeyBadge>{entry.keys}</KeyBadge>
                                                    </ShortcutKeys>
                                                    <span>{t(entry.descriptionKey)}</span>
                                                </ShortcutRow>
                                            ))}
                                        </Card>
                                    </SettingsSection>
                                ))}
                            </>
                        )}

                        {section === 'system' && (
                            <>
                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.general')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.system.language')}
                                            description={t('settings.system.languageHint')}
                                            control={
                                                <Segmented<LanguagePreference>
                                                    ariaLabel={t('settings.system.language')}
                                                    value={props.language}
                                                    options={LANGUAGE_OPTIONS.map((option) => ({
                                                        value: option.value,
                                                        label: t(option.labelKey),
                                                    }))}
                                                    onChange={props.setLanguage}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.system.logging')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.system.logLevel')}
                                            description={t('settings.system.logLevelHint')}
                                            control={
                                                <Segmented<LogLevel>
                                                    ariaLabel={t('settings.system.logLevel')}
                                                    value={props.logLevel}
                                                    options={LOG_LEVEL_OPTIONS.map((option) => ({
                                                        value: option.value,
                                                        label: t(option.labelKey),
                                                    }))}
                                                    onChange={props.setLogLevel}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t('settings.system.logFolder')}
                                            description={t('settings.system.logFolderHint')}
                                            control={
                                                <Button size="small" onClick={onOpenLogDir}>
                                                    {t('settings.system.openLogFolder')}
                                                </Button>
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.group.startupWindow')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.system.startOnBoot')}
                                            control={
                                                <SettingSwitch
                                                    checked={props.startOnBoot}
                                                    onChange={setStartOnBoot}
                                                    label={t('settings.system.startOnBoot')}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t('settings.system.compactAlwaysOnTop')}
                                            control={
                                                <SettingSwitch
                                                    checked={props.compactAlwaysOnTop}
                                                    onChange={props.setCompactAlwaysOnTop}
                                                    label={t('settings.system.compactAlwaysOnTop')}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t('settings.system.hardwareAcceleration')}
                                            description={t(
                                                'settings.system.hardwareAccelerationHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.useHardwareAcceleration}
                                                    onChange={setUseHardwareAcceleration}
                                                    label={t(
                                                        'settings.system.hardwareAcceleration'
                                                    )}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t('settings.system.unloadOnCloseToTray')}
                                            description={t(
                                                'settings.system.unloadOnCloseToTrayHint'
                                            )}
                                            control={
                                                <SettingSwitch
                                                    checked={props.unloadOnCloseToTray}
                                                    onChange={setUnloadOnCloseToTray}
                                                    label={t('settings.system.unloadOnCloseToTray')}
                                                />
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.system.update')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            title={t('settings.system.autoUpdate')}
                                            description={t('settings.system.autoUpdateHint')}
                                            control={
                                                <SettingSwitch
                                                    checked={props.autoUpdate}
                                                    onChange={switchAutoUpdate}
                                                    label={t('settings.system.autoUpdate')}
                                                />
                                            }
                                        />
                                        <SettingsRow
                                            title={t('settings.system.checkUpdate')}
                                            description={t('settings.system.checkUpdateHint')}
                                            control={
                                                <Button
                                                    size="small"
                                                    loading={checkingUpdate}
                                                    onClick={onCheckUpdate}
                                                >
                                                    {t('settings.system.checkUpdate')}
                                                </Button>
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.system.dataManagement')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            wide
                                            title={t('settings.system.dataBackup')}
                                            description={t('settings.system.dataManagementHint')}
                                            control={
                                                <ControlCluster>
                                                    <Button size="small" onClick={onOpenDataDir}>
                                                        {t('settings.system.openDataFolder')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        onClick={onExportClick}
                                                        loading={exporting}
                                                    >
                                                        {t('settings.system.exportData')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        loading={importing}
                                                        onClick={onImportConfirm}
                                                    >
                                                        {t('settings.system.importData')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        loading={checking}
                                                        onClick={onCheckData}
                                                    >
                                                        {t('settings.system.checkData')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        onClick={() => setHoursOpen(true)}
                                                    >
                                                        {t('appHours.button')}
                                                    </Button>
                                                </ControlCluster>
                                            }
                                        />
                                        <SettingsRow
                                            description={t('settings.system.deleteAllHint')}
                                            control={
                                                <Button
                                                    size="small"
                                                    danger={true}
                                                    onClick={onDeleteConfirm}
                                                >
                                                    {t('settings.system.deleteAllData')}
                                                </Button>
                                            }
                                        />
                                    </Card>
                                </SettingsSection>

                                <SettingsSection>
                                    <GroupTitle>{t('settings.reset.group')}</GroupTitle>
                                    <Card>
                                        <SettingsRow
                                            description={t('settings.reset.hint')}
                                            control={
                                                <Button
                                                    size="small"
                                                    danger
                                                    onClick={onResetConfirm}
                                                >
                                                    {t('settings.reset.button')}
                                                </Button>
                                            }
                                        />
                                    </Card>
                                </SettingsSection>
                            </>
                        )}

                        {section === 'about' && (
                            <AboutWrap>
                                <Card>
                                    <AboutBody>
                                        <AboutName>{t('app.title')}</AboutName>
                                        <AboutVersion>
                                            {t('settings.footer.version', pkg.version)}
                                        </AboutVersion>
                                        <AboutHint>{t('settings.about.hint')}</AboutHint>
                                        <AboutActions>
                                            <Button onClick={openIssuePage}>
                                                {t('settings.about.feedback')}
                                            </Button>
                                            <Hint label={t('settings.about.githubTitle')}>
                                                <GithubLink
                                                    type="button"
                                                    aria-label="GitHub"
                                                    onClick={openGithubPage}
                                                >
                                                    <GithubOutlined />
                                                    {t('settings.footer.openSource')}
                                                </GithubLink>
                                            </Hint>
                                        </AboutActions>
                                    </AboutBody>
                                </Card>
                            </AboutWrap>
                        )}
                    </SettingsContent>
                </Pane>
                <DataRepairDialog
                    open={repairOpen}
                    report={report ?? EMPTY_DATA_REPORT}
                    onClose={() => setRepairOpen(false)}
                    onRescan={rescanData}
                    applyRepair={applyRepair}
                    instant={repairInstantClose}
                    onOpenAppHours={() => {
                        setRepairInstantClose(true);
                        setRepairOpen(false);
                        setHoursOpen(true);
                    }}
                />
                <AppHoursCalibrationDialog
                    open={hoursOpen}
                    onClose={() => setHoursOpen(false)}
                    onRepaired={() => {
                        void reloadDataStore();
                    }}
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
    window.api.openExternal(ISSUES_URL);
}

function openGithubPage() {
    window.api.openExternal('https://github.com/NightZed/PomodoroLogger-Enhanced');
}
