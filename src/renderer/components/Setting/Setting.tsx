import React, { useCallback, useState } from 'react';
import { TimerActionTypes, TimerState } from '../Timer/action';
import styled from 'styled-components';
import { Button, Col, Icon, message, notification, Popconfirm, Row, Slider, Switch } from 'antd';
import { deleteAllUserData } from '../../monitor/sessionManager';
import { shell, ipcRenderer } from 'electron';
import { DistractingListModalButton } from './DistractingList';
import { isShallowEqualByKeys } from '../../utils';
import pkg from '../../../../package.json';
import { IpcEventName, UpdateErrorPayload, UpdateEventName } from '../../../main/ipc/type';
import { refreshDbs } from '../../../main/db';
import { BUILTIN_THEMES, ThemeDefinition } from '../../theme/tokens';

const Container = styled.div`
    padding: 12px 36px;
    color: var(--pl-text);
`;

const SliderContainer = styled.div`
    padding: 4px 24px;
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

const Footer = styled.footer`
    border-top: 1px solid var(--pl-border);
    padding: 0.6rem 0;
    position: relative;
    margin: 0.8rem auto;
    width: 100%;
    text-align: center;
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

const DEFAULT_CALENDAR_BASE_COLOR = '#aceebb';

const restMarks = {
    5: '5min',
    10: '10min',
};

const longBreakMarks = {
    10: '10min',
    15: '15min',
    20: '20min',
};

const settingUiStates = [
    'focusDuration',
    'restDuration',
    'autoUpdate',
    'longBreakDuration',
    'monitorInterval',
    'screenShotInterval',
    'useHardwareAcceleration',
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

            notification.open({
                message: 'Restart App to Apply Changes',
                description: 'Screenshot setting change needs restart to be applied',
                duration: 0,
                icon: <Icon type="warning" />,
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
                message.info(info);
                onResult();
            };
            const onError = (event: any, payload: UpdateErrorPayload) => {
                message.error('Failed to check for update: ' + (payload?.message ?? payload));
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
            notification.open({
                message: 'Restart App to Apply Changes',
                description: 'Hardware acceleration setting change needs restart to be applied',
                duration: 0,
                icon: <Icon type="warning" />,
            });
        }, []);

        const setCalendarColor = useCallback((v: string) => {
            props.setCalendarBaseColor(v);
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

        const onDeleteData = useCallback(() => {
            deleteAllUserData().then(() => {
                message.info('All user data is removed. Pomodoro needs to restart.');
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

        return (
            <Container>
                <h4>Appearance</h4>
                <ThemeOptions>
                    {themes.map((theme: ThemeDefinition) => (
                        <ThemeButton
                            key={theme.id}
                            active={!props.followSystemTheme && props.themeId === theme.id}
                            onClick={() => onSelectTheme(theme.id)}
                            title={`Switch to the ${theme.name} theme`}
                        >
                            <Swatches>
                                <i style={{ backgroundColor: theme.tokens.bg }} />
                                <i style={{ backgroundColor: theme.tokens.bgElevated }} />
                                <i style={{ backgroundColor: theme.tokens.primary }} />
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
                <br />

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

                <Row>
                    <Col span={12}>
                        <h4>Short Break</h4>
                        <SliderContainer>
                            <Slider
                                marks={restMarks}
                                step={1}
                                min={process.env.NODE_ENV === 'production' ? 5 : 1}
                                max={20}
                                value={props.restDuration / 60}
                                onChange={onChangeRest}
                            />
                        </SliderContainer>
                    </Col>
                    <Col span={12}>
                        <h4>Long Break</h4>
                        <SliderContainer>
                            <Slider
                                marks={longBreakMarks}
                                step={1}
                                min={10}
                                max={40}
                                value={props.longBreakDuration / 60}
                                onChange={onChangeLongBreak}
                            />
                        </SliderContainer>
                    </Col>
                </Row>
                <SettingLabel>Hardware Acceleration</SettingLabel>
                <Switch
                    onChange={setUseHardwareAcceleration}
                    checked={props.useHardwareAcceleration}
                    style={{ margin: 8 }}
                />
                <br />

                <SettingLabel>Start On Boot</SettingLabel>
                <Switch
                    onChange={setStartOnBoot}
                    checked={props.startOnBoot}
                    style={{ margin: 8 }}
                />
                <br />
                <SettingLabel>Auto Update</SettingLabel>
                <Switch
                    onChange={switchAutoUpdate}
                    checked={props.autoUpdate}
                    style={{ margin: 8 }}
                />
                <Button size="small" loading={checkingUpdate} onClick={onCheckUpdate}>
                    Check Update
                </Button>
                <br />

                <SettingLabel>Screenshot</SettingLabel>
                <Switch
                    onChange={switchScreenshot}
                    checked={!!props.screenShotInterval}
                    style={{ margin: 8 }}
                />
                <br />

                <SettingLabel>Calendar Base Color</SettingLabel>
                <ColorInput
                    type="color"
                    value={props.calendarBaseColor}
                    onChange={(e) => setCalendarColor(e.target.value)}
                />
                <Button size="small" onClick={resetCalendarColor}>
                    Reset
                </Button>
                <br />

                <h4>Data Management</h4>
                <ButtonWrapper>
                    <Button onClick={onExportClick} loading={exporting}>
                        Export Data
                    </Button>
                </ButtonWrapper>
                <ButtonWrapper>
                    <Popconfirm
                        title={'Pomodoro Logger will restart after importing. Continue?'}
                        onConfirm={onImportClick}
                    >
                        <Button loading={importing}>Import Data</Button>
                    </Popconfirm>
                </ButtonWrapper>
                <ButtonWrapper>
                    <Popconfirm title={'Sure to delete?'} onConfirm={onDeleteData}>
                        <Button type="danger">Delete All Data</Button>
                    </Popconfirm>
                </ButtonWrapper>
                <h4>Misc</h4>
                <ButtonWrapper>
                    <Button onClick={openIssuePage}>Feedback</Button>
                    <br />
                </ButtonWrapper>
                <ButtonWrapper>
                    <DistractingListModalButton />
                </ButtonWrapper>
                <Footer style={{ position: 'fixed', bottom: 0, margin: 0, left: 0 }}>
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
