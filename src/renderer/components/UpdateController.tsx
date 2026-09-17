import { ipcRenderer } from 'electron';
import * as React from 'react';
import { Modal, notification } from 'antd';
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
            const phase = payload?.phase === 'download' ? 'Download' : 'Check';
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
        const args = {
            key: 'update-downloaded',
            message: 'Update Downloaded',
            description: 'When you are ready, quit the app to start installation',
            duration: 0,
        };
        notification.open(args);
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
                            border: '1px solid #e8e8e8',
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
