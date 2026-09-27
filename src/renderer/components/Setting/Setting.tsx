import React, { useCallback, useState } from 'react';
import { TimerActionTypes, TimerState } from '../Timer/action';
import styled from 'styled-components';
import { Button, Icon, Slider, Switch } from 'antd';
import { deleteAllUserData } from '../../monitor/sessionManager';
import { shell, ipcRenderer } from 'electron';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { DistractingListModalButton } from './DistractingList';
import { isShallowEqualByKeys } from '../../utils';
import pkg from '../../../../package.json';
import { IpcEventName, UpdateErrorPayload, UpdateEventName } from '../../../main/ipc/type';
import { refreshDbs } from '../../../main/db';
import { BUILTIN_THEMES, ThemeDefinition } from '../../theme/tokens';
import SettingNav from './SettingNav';
import { DEFAULT_SECTION, SectionId, SHORTCUTS, SHORTCUT_DISCLAIMER } from './sections';

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

    ::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    ::-webkit-color-swatch {
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

const StyledIcon = styled(Icon)`
    font-size: 1.25rem;
    color: var(--pl-text);
    transition: color 0.1s;
    margin: 0 0.3rem;
    :hover {
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
    active: boolean;
}

const ThemeButton = styled.button<ThemeButtonProps>`
    display: flex;
    align-items: center;
    padding: 6px 12px;
    margin: 4px 8px 4px 0;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background-color 0.15s;
    background-color: ${({ active }) => (active ? 'var(--pl-bg-hover)' : 'var(--pl-bg-elevated)')};
    border: 1px solid ${({ active }) => (active ? 'var(--pl-primary)' : 'var(--pl-border)')};
    color: ${({ active }) => (active ? 'var(--pl-primary)' : 'var(--pl-text)')};

    :hover {
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
    20: '20%',
    60: '60%',
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

const opacityMarks = {
    40: '40%',
    70: '70%',
    100: '100%',
};

const settingUiStates = [
    'focusDuration',
    'restDuration',
    'autoUpdate',
    'longBreakDuration',
    'monitorInterval',
    'screenShotInterval',
    'warnBeforeFocusStart',
    'useHardwareAcceleration',
    'compactAlwaysOnTop',
    'windowOpacity',
    'wallpaperPath',
    'wallpaperOpacity',
    'startOnBoot',
    'distractingList',
    'calendarBaseColor',
    'themeId',
    'followSystemTheme',
    'customThemes',
];

interface Props extends TimerState, TimerActionTypes {}
export const Setting: React.FunctionComponent<Props> = React.memo(
    (props: Props) => {
        const [importing, setImporting] = useState(false);
        const [exporting, setExporting] = useState(false);
        const onChangeFocus = React.useCallback((v: number | [number, number]) => {
            if (v instanceof Array) {
                return;
            }

            props.setFocusDuration(v * 60);
        }, []);

        const onChangeRest = React.useCallback((v: number | [number, number]) => {
            if (v instanceof Array) {
                return;
            }

            props.setRestDuration(v * 60);
        }, []);

        const onChangeLongBreak = React.useCallback((v: number | [number, number]) => {
            if (v instanceof Array) {
                return;
            }

            props.setLongBreakDuration(v * 60);
        }, []);

        const switchScreenshot = React.useCallback((v: boolean) => {
            if (v) {
                props.setScreenShotInterval(1000 * 60 * 5);
            } else {
                props.setScreenShotInterval(undefined);
            }

            feedback.notice({
                kind: 'warning',
                title: FEEDBACK_MESSAGES.setting.restartToApply,
                description: FEEDBACK_MESSAGES.setting.screenshotRestart,
            });
        }, []);

        const switchAutoUpdate = React.useCallback((v: boolean) => {
            props.setAutoUpdate(v);
        }, []);

        const [checkingUpdate, setCheckingUpdate] = useState(false);
        const onCheckUpdate = useCallback(() => {
            setCheckingUpdate(true);
            // The main process answers with one of the three events below; the timeout
            // is only a safety net so the button never gets stuck in loading state.
            // prefer-const is a false positive here: the value is assigned once, but
            // only after the listeners below are registered (merging it into the
            // declaration would read the binding before it is initialised).
            // eslint-disable-next-line prefer-const
            let timeout: any;
            const onResult = () => {
                clearTimeout(timeout);
                ipcRenderer.removeListener(UpdateEventName.Available, onAvailable);
                ipcRenderer.removeListener(UpdateEventName.NotAvailable, onNotAvailable);
                ipcRenderer.removeListener(UpdateEventName.Error, onError);
                setCheckingUpdate(false);
            };
            const onAvailable = () => onResult();
            const onNotAvailable = (event: any, info: string) => {
                // Receipt of the check: a toast, not a dialog. "You are on the
                // latest version" does not need an acknowledgement.
                feedback.toast({ kind: 'info', content: info });
                onResult();
            };
            const onError = (event: any, payload: UpdateErrorPayload) => {
                feedback.toast({
                    kind: 'error',
                    content: FEEDBACK_MESSAGES.update.checkFailed(
                        String(payload?.message ?? payload)
                    ),
                });
                onResult();
            };
            ipcRenderer.on(UpdateEventName.Available, onAvailable);
            ipcRenderer.on(UpdateEventName.NotAvailable, onNotAvailable);
            ipcRenderer.on(UpdateEventName.Error, onError);
            timeout = setTimeout(onResult, 30000);
            ipcRenderer.send(IpcEventName.CheckUpdate);
        }, []);

        const setStartOnBoot = React.useCallback((v: boolean) => {
            props.setStartOnBoot(v);
            window.api.openAtLogin(v);
        }, []);

        const setUseHardwareAcceleration = useCallback((v: boolean) => {
            props.setUseHardwareAcceleration(v);
            feedback.notice({
                kind: 'warning',
                title: FEEDBACK_MESSAGES.setting.restartToApply,
                description: FEEDBACK_MESSAGES.setting.hardwareAccelerationRestart,
            });
        }, []);

        const setCalendarColor = useCallback((v: string) => {
            props.setCalendarBaseColor(v);
        }, []);

        const onToggleFocusStartWarning = useCallback((v: boolean) => {
            props.setWarnBeforeFocusStart(v);
        }, []);

        const resetCalendarColor = useCallback(() => {
            props.setCalendarBaseColor(DEFAULT_CALENDAR_BASE_COLOR);
        }, []);

        const themes = React.useMemo(
            () => (props.customThemes ? BUILTIN_THEMES.concat(props.customThemes) : BUILTIN_THEMES),
            [props.customThemes]
        );

        const onSelectTheme = useCallback(
            (themeId: string) => {
                props.setThemeId(themeId);
                // Picking a theme explicitly takes over from the OS preference.
                if (props.followSystemTheme) {
                    props.setFollowSystemTheme(false);
                }
            },
            [props.followSystemTheme]
        );

        const onToggleFollowSystem = useCallback((follow: boolean) => {
            props.setFollowSystemTheme(follow);
        }, []);

        const onSelectWallpaper = useCallback(async () => {
            const path = await window.api.selectWallpaper();
            if (path) {
                props.setWallpaperPath(path);
            }
        }, []);

        const onClearWallpaper = useCallback(() => {
            props.setWallpaperPath(undefined);
        }, []);

        const onDeleteData = useCallback(() => {
            deleteAllUserData().then(() => {
                feedback.toast({
                    kind: 'info',
                    content: FEEDBACK_MESSAGES.setting.dataRemoved,
                });
                setTimeout(() => {
                    ipcRenderer.send(IpcEventName.Restart);
                }, 3000);
            });
        }, [deleteAllUserData]);

        const onImportClick = useCallback(async () => {
            setImporting(true);
            await onImportData();
            setImporting(false);
        }, []);

        const onExportClick = useCallback(async () => {
            setExporting(true);
            await onExportData();
            setExporting(false);
        }, []);

        // Both operations are destructive/irreversible enough to deserve the
        // blocking dialog instead of an in place popover: the user gets the
        // consequence spelled out in the title of the confirmation.
        const onImportConfirm = useCallback(() => {
            feedback.confirm({
                kind: 'warning',
                title: FEEDBACK_MESSAGES.setting.importConfirm,
                okText: 'Import',
                onOk: () => {
                    onImportClick();
                },
            });
        }, [onImportClick]);

        const onDeleteConfirm = useCallback(() => {
            feedback.confirm({
                kind: 'error',
                title: FEEDBACK_MESSAGES.setting.deleteAllConfirm,
                okText: 'Delete',
                onOk: onDeleteData,
            });
        }, [onDeleteData]);

        const [section, setSection] = useState<SectionId>(DEFAULT_SECTION);

        return (
            <Container>
                <SettingNav active={section} onChange={setSection} />
                <Pane>
                    {section === 'timer' && (
                        <>
                            <Field>
                                <h4>Focus Duration</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={marks}
                                        step={1}
                                        min={process.env.NODE_ENV === 'production' ? 20 : 2}
                                        max={60}
                                        value={props.focusDuration / 60}
                                        onChange={onChangeFocus}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>Short Break</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={restMarks}
                                        step={1}
                                        min={1}
                                        max={20}
                                        value={props.restDuration / 60}
                                        onChange={onChangeRest}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>Long Break</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={longBreakMarks}
                                        step={1}
                                        min={1}
                                        max={40}
                                        value={props.longBreakDuration / 60}
                                        onChange={onChangeLongBreak}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>Distracting App Setting</h4>
                                <ButtonWrapper>
                                    <DistractingListModalButton />
                                </ButtonWrapper>
                            </Field>
                        </>
                    )}

                    {section === 'appearance' && (
                        <>
                            <Field>
                                <h4>Theme</h4>
                                <ThemeOptions>
                                    {themes.map((theme: ThemeDefinition) => (
                                        <ThemeButton
                                            key={theme.id}
                                            active={
                                                !props.followSystemTheme &&
                                                props.themeId === theme.id
                                            }
                                            onClick={() => onSelectTheme(theme.id)}
                                            title={`Switch to the ${theme.name} theme`}
                                        >
                                            <Swatches>
                                                <i style={{ backgroundColor: theme.tokens.bg }} />
                                                <i
                                                    style={{
                                                        backgroundColor: theme.tokens.bgElevated,
                                                    }}
                                                />
                                                <i
                                                    style={{
                                                        backgroundColor: theme.tokens.primary,
                                                    }}
                                                />
                                            </Swatches>
                                            {theme.name}
                                        </ThemeButton>
                                    ))}
                                </ThemeOptions>
                                <SettingLabel>Follow System</SettingLabel>
                                <Switch
                                    onChange={onToggleFollowSystem}
                                    checked={props.followSystemTheme}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>Window Opacity</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={opacityMarks}
                                        min={40}
                                        max={100}
                                        step={5}
                                        value={Math.round(props.windowOpacity * 100)}
                                        onChange={(value) => {
                                            if (typeof value === 'number') {
                                                props.setWindowOpacity(value / 100);
                                            }
                                        }}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <SettingLabel>Keep Small Window Always On Top</SettingLabel>
                                <Switch
                                    onChange={props.setCompactAlwaysOnTop}
                                    checked={props.compactAlwaysOnTop}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>Background Wallpaper</h4>
                                <Button
                                    size="small"
                                    onClick={onSelectWallpaper}
                                    style={{ margin: 8 }}
                                >
                                    Choose
                                </Button>
                                {props.wallpaperPath && (
                                    <Button size="small" onClick={onClearWallpaper}>
                                        Clear
                                    </Button>
                                )}
                            </Field>

                            <Field>
                                <h4>Wallpaper Opacity</h4>
                                <SliderContainer>
                                    <Slider
                                        marks={wallpaperOpacityMarks}
                                        min={20}
                                        max={100}
                                        step={5}
                                        value={Math.round(props.wallpaperOpacity * 100)}
                                        onChange={(value) => {
                                            if (typeof value === 'number') {
                                                props.setWallpaperOpacity(value / 100);
                                            }
                                        }}
                                    />
                                </SliderContainer>
                            </Field>

                            <Field>
                                <h4>Calendar Base Color</h4>
                                <ColorInput
                                    type="color"
                                    value={props.calendarBaseColor}
                                    onChange={(e) => setCalendarColor(e.target.value)}
                                />
                                <Button size="small" onClick={resetCalendarColor}>
                                    Reset
                                </Button>
                            </Field>
                        </>
                    )}

                    {section === 'notification' && (
                        <>
                            <Field>
                                <h4>Screenshot</h4>
                                <Hint>
                                    Takes a screenshot every 5 minutes while a session is running.
                                </Hint>
                                <Switch
                                    onChange={switchScreenshot}
                                    checked={!!props.screenShotInterval}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>Focus Start Warning</h4>
                                <Hint>
                                    Asks for a confirmation before starting a focus session without
                                    a project.
                                </Hint>
                                <Switch
                                    onChange={onToggleFocusStartWarning}
                                    checked={props.warnBeforeFocusStart}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>Session End</h4>
                                <Hint>
                                    A chime plays when a session finishes. There is no desktop
                                    notification: the ending screen takes over the window instead.
                                </Hint>
                            </Field>
                        </>
                    )}

                    {section === 'shortcuts' && (
                        <Field>
                            <h4>Keyboard Shortcuts</h4>
                            <Hint>{SHORTCUT_DISCLAIMER}</Hint>
                            {SHORTCUTS.map((group) => (
                                <ShortcutGroup key={group.group}>
                                    <h5>{group.group}</h5>
                                    {group.entries.map((entry) => (
                                        <ShortcutRow key={entry.keys}>
                                            <ShortcutKeys>
                                                <ShortcutKey>{entry.keys}</ShortcutKey>
                                            </ShortcutKeys>
                                            <span>{entry.description}</span>
                                        </ShortcutRow>
                                    ))}
                                </ShortcutGroup>
                            ))}
                        </Field>
                    )}

                    {section === 'system' && (
                        <>
                            <Field>
                                <h4>Startup</h4>
                                <SettingLabel>Start On Boot</SettingLabel>
                                <Switch
                                    onChange={setStartOnBoot}
                                    checked={props.startOnBoot}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <SettingLabel>Hardware Acceleration</SettingLabel>
                                <Switch
                                    onChange={setUseHardwareAcceleration}
                                    checked={props.useHardwareAcceleration}
                                    style={{ margin: 8 }}
                                />
                            </Field>

                            <Field>
                                <h4>Update</h4>
                                <SettingLabel>Auto Update</SettingLabel>
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
                                    Check Update
                                </Button>
                            </Field>

                            <Field>
                                <h4>Data Management</h4>
                                <ButtonWrapper>
                                    <Button onClick={onExportClick} loading={exporting}>
                                        Export Data
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button loading={importing} onClick={onImportConfirm}>
                                        Import Data
                                    </Button>
                                </ButtonWrapper>
                                <ButtonWrapper>
                                    <Button type="danger" onClick={onDeleteConfirm}>
                                        Delete All Data
                                    </Button>
                                </ButtonWrapper>
                            </Field>
                        </>
                    )}

                    {section === 'about' && (
                        <Field>
                            <h4>Pomodoro Logger Enhanced</h4>
                            <Hint>
                                A time logger that meets the Pomodoro technique and a kanban board.
                            </Hint>
                            <ButtonWrapper>
                                <Button onClick={openIssuePage}>Feedback</Button>
                            </ButtonWrapper>
                        </Field>
                    )}
                </Pane>
                <Footer>
                    Open Source @GitHub
                    <StyledIcon
                        type="github"
                        onClick={openGithubPage}
                        title="This project is open-source and hosted on GitHub"
                    />
                    Version v{pkg.version}
                </Footer>
            </Container>
        );
    },
    (prevProps, nextProps) => {
        return isShallowEqualByKeys(prevProps, nextProps, settingUiStates);
    }
);

async function onExportData() {
    await refreshDbs();
    await window.api.exportData();
}

async function onImportData() {
    await refreshDbs();
    await window.api.importData();
}

function openIssuePage() {
    shell.openExternal('https://github.com/NightZed/PomodoroLogger-Enhanced/issues/new');
}

function openGithubPage() {
    shell.openExternal('https://github.com/NightZed/PomodoroLogger-Enhanced');
}
