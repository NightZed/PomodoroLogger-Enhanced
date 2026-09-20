import { ipcRenderer } from 'electron';
import * as React from 'react';
import { Button, Modal, notification } from 'antd';
import { IpcEventName, UpdateErrorPayload, UpdateEventName } from '../../main/ipc/type';
import formatMarkdown from './Kanban/Card/formatMarkdown';

interface UpdateInfo {
    version: string;
    releaseName?: string;
    releaseNotes?: string;
}

interface State {
    type: 'hidden' | 'update-available';
    updateInfo: UpdateInfo | null;
}

const RELEASE_PAGE = 'https://github.com/NightZed/PomodoroLogger-Enhanced/releases';
// Fixed keys keep repeated events from stacking up identical notifications.
const ERROR_NOTIFICATION_KEY = 'update-error';
const PROGRESS_NOTIFICATION_KEY = 'update-progress';
const DOWNLOADED_NOTIFICATION_KEY = 'update-downloaded';

export class UpdateController extends React.Component<any, State> {
    private updateAvailableHandler?: (event: any, info: UpdateInfo) => void;
    private updateDownloadedHandler?: () => void;
    private updateErrorHandler?: (event: any, payload: UpdateErrorPayload) => void;
    private updateProgressHandler?: (event: any, info: { percent: number }) => void;

    constructor(props: any) {
        super(props);
        this.state = {
            type: 'hidden',
            updateInfo: null,
        };
    }

    componentDidMount() {
        this.updateAvailableHandler = (event: any, info: UpdateInfo) => {
            this.setState({
                updateInfo: info,
                type: 'update-available',
            });
        };
        ipcRenderer.addListener(UpdateEventName.Available, this.updateAvailableHandler);

        this.updateDownloadedHandler = () => {
            notification.close(PROGRESS_NOTIFICATION_KEY);
            this.notifyDownloaded();
        };
        ipcRenderer.addListener(UpdateEventName.Downloaded, this.updateDownloadedHandler);

        this.updateProgressHandler = (event: any, info: { percent: number }) => {
            notification.open({
                key: PROGRESS_NOTIFICATION_KEY,
                message: 'Downloading Update',
                description: `${Math.round(info.percent)}%`,
                duration: 0,
            });
        };
        ipcRenderer.addListener(UpdateEventName.Progress, this.updateProgressHandler);

        this.updateErrorHandler = (event: any, payload: UpdateErrorPayload) => {
            const phase =
                payload?.phase === 'download'
                    ? 'Download'
                    : payload?.phase === 'install'
                    ? 'Install'
                    : 'Check';
            notification.close(PROGRESS_NOTIFICATION_KEY);
            notification.open({
                key: ERROR_NOTIFICATION_KEY,
                message: `Update ${phase} Failed`,
                description: (
                    <div>
                        <div style={{ marginBottom: 4 }}>{payload?.message}</div>
                        <div>
                            You can download manually from{' '}
                            <a href={RELEASE_PAGE} target="_blank" rel="noreferrer">
                                {RELEASE_PAGE}
                            </a>
                        </div>
                    </div>
                ),
                duration: 0,
            });
        };
        ipcRenderer.addListener(UpdateEventName.Error, this.updateErrorHandler);
    }

    componentWillUnmount() {
        if (this.updateAvailableHandler) {
            ipcRenderer.removeListener(UpdateEventName.Available, this.updateAvailableHandler);
        }
        if (this.updateDownloadedHandler) {
            ipcRenderer.removeListener(UpdateEventName.Downloaded, this.updateDownloadedHandler);
        }
        if (this.updateErrorHandler) {
            ipcRenderer.removeListener(UpdateEventName.Error, this.updateErrorHandler);
        }
        if (this.updateProgressHandler) {
            ipcRenderer.removeListener(UpdateEventName.Progress, this.updateProgressHandler);
        }
    }

    onOk = () => {
        ipcRenderer.send(IpcEventName.DownloadUpdate, 'manual');
        this.setState({ type: 'hidden' });
    };

    onCancel = () => {
        this.setState({ type: 'hidden' });
    };

    notifyDownloaded = () => {
        notification.open({
            key: DOWNLOADED_NOTIFICATION_KEY,
            message: 'Update Downloaded',
            description: 'Restart now to install the update, or quit the app to install it later.',
            btn: (
                <Button type="primary" size="small" onClick={this.onInstallNow}>
                    Restart &amp; Install
                </Button>
            ),
            duration: 0,
        });
    };

    onInstallNow = () => {
        notification.close(DOWNLOADED_NOTIFICATION_KEY);
        // Explain what is about to happen; the NSIS installer takes over (with its
        // native progress banner) right after the app quits, and the modal is
        // dismissed along with the process. The OK button stays available so this
        // modal can still be closed during development, where the install request
        // is only logged.
        Modal.info({
            title: 'Installing Update',
            content:
                'The application is quitting to install the update. It will start again automatically once the installation finishes.',
        });
        setTimeout(() => {
            ipcRenderer.send(IpcEventName.InstallUpdate);
        }, 1500);
    };

    render() {
        return (
            <Modal
                title={'Update Available'}
                visible={this.state.type === 'update-available'}
                onOk={this.onOk}
                onCancel={this.onCancel}
            >
                <p>A new version is available: </p>
                <p>
                    Version: {this.state.updateInfo?.version}
                    {this.state.updateInfo?.releaseName
                        ? `; ${this.state.updateInfo.releaseName}`
                        : ''}
                </p>
                {this.state.updateInfo?.releaseNotes ? (
                    <div
                        style={{
                            maxHeight: 300,
                            overflowY: 'auto',
                            border: '1px solid var(--pl-border)',
                            borderRadius: 4,
                            padding: 12,
                            marginBottom: 12,
                        }}
                        dangerouslySetInnerHTML={{
                            __html: formatMarkdown(this.state.updateInfo.releaseNotes),
                        }}
                    />
                ) : null}
                <p>Start downloading now?</p>
            </Modal>
        );
    }
}
