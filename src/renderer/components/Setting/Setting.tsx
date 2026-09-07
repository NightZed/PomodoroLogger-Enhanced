import React, { useCallback, useState } from 'react';
import { TimerActionTypes, TimerState } from '../Timer/action';
import styled from 'styled-components';
import { Button, Col, Icon, message, notification, Popconfirm, Row, Slider, Switch } from 'antd';
import { deleteAllUserData } from '../../monitor/sessionManager';
import { shell, ipcRenderer } from 'electron';
import { DistractingListModalButton } from './DistractingList';
import { isShallowEqualByKeys } from '../../utils';
import pkg from '../../../../package.json';
import { IpcEventName } from '../../../main/ipc/type';
import { refreshDbs } from '../../../main/db';

const Container = styled.div`
    padding: 12px 36px;
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
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 2px;
    }
`;

const Footer = styled.footer`
    border-top: 1px solid rgb(240, 240, 240);
    padding: 0.6rem 0;
    position: relative;
    margin: 0.8rem auto;
    width: 100%;
    text-align: center;
`;

const StyledIcon = styled(Icon)`
    font-size: 1.25rem;
    color: black;
    transition: color 0.1s;
    margin: 0 0.3rem;
    :hover {
        color: rgb(87, 80, 89);
    }
`;

const marks = {
    25: '25min',
    35: '35min',
    45: '45min',
};

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
            const onResult = (hasUpdate: boolean) => {
                ipcRenderer.removeListener('update-available', onAvailable);
                ipcRenderer.removeListener('update-not-available', onNotAvailable);
                ipcRenderer.removeListener('error', onError);
                setCheckingUpdate(false);
            };
            const onAvailable = () => onResult(true);
            const onNotAvailable = (event: any, info: string) => {
                message.info(info);
                onResult(false);
            };
            const onError = (event: any, err: any) => {
                message.error('Failed to check for update: ' + err);
                onResult(false);
            };
            ipcRenderer.on('update-available', onAvailable);
            ipcRenderer.on('update-not-available', onNotAvailable);
            ipcRenderer.on('error', onError);
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
                <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(0, 0, 0, 0.85)' }}>
                    Hardware Acceleration
                </span>
                <Switch
                    onChange={setUseHardwareAcceleration}
                    checked={props.useHardwareAcceleration}
                    style={{ margin: 8 }}
                />
                <br />

                <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(0, 0, 0, 0.85)' }}>
                    Start On Boot
                </span>
                <Switch
                    onChange={setStartOnBoot}
                    checked={props.startOnBoot}
                    style={{ margin: 8 }}
                />
                <br />
                <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(0, 0, 0, 0.85' }}>
                    Auto Update
                </span>
                <Switch
                    onChange={switchAutoUpdate}
                    checked={props.autoUpdate}
                    style={{ margin: 8 }}
                />
                <Button size="small" loading={checkingUpdate} onClick={onCheckUpdate}>
                    Check Update
                </Button>
                <br />

                <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(0, 0, 0, 0.85' }}>
                    Screenshot
                </span>
                <Switch
                    onChange={switchScreenshot}
                    checked={!!props.screenShotInterval}
                    style={{ margin: 8 }}
                />
                <br />

                <span style={{ fontWeight: 500, fontSize: 14, color: 'rgba(0, 0, 0, 0.85)' }}>
                    Calendar Base Color
                </span>
                <ColorInput
                    type="color"
                    value={props.calendarBaseColor}
                    onChange={(e) => setCalendarColor(e.target.value)}
                />
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
