import { ipcRenderer } from 'electron';
import * as React from 'react';
import { Modal, notification } from 'antd';
import formatMarkdown from './Kanban/Card/formatMarkdown';

interface UpdateInfo {
    version: string;
    releaseName?: string;
    releaseNotes?: string;
}

interface State {
    type: 'hidden' | 'update-available' | 'progress' | 'downloaded';
    progress: number;
    updateInfo: UpdateInfo | null;
}

export class UpdateController extends React.Component<any, State> {
    private updateAvailableHandler?: (event: any, info: UpdateInfo) => void;
    private updateDownloadedHandler?: () => void;
    private updateErrorHandler?: (event: any, message: string) => void;

    constructor(props: any) {
        super(props);
        this.state = {
            type: 'hidden',
            progress: 0,
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
        ipcRenderer.addListener('update-available', this.updateAvailableHandler);

        this.updateDownloadedHandler = () => {
            this.notifyDownloaded();
        };
        ipcRenderer.addListener('update-downloaded', this.updateDownloadedHandler);

        this.updateErrorHandler = (event: any, message: string) => {
            const args = {
                message: 'Update Download Failed',
                description:
                    'You can download manually from https://github.com/NightZed/PomodoroLogger-Enhanced/releases',
                duration: 0,
            };
            notification.open(args);
        };
        ipcRenderer.addListener('error', this.updateErrorHandler);
    }

    componentWillUnmount() {
        if (this.updateAvailableHandler) {
            ipcRenderer.removeListener('update-available', this.updateAvailableHandler);
        }
        if (this.updateDownloadedHandler) {
            ipcRenderer.removeListener('update-downloaded', this.updateDownloadedHandler);
        }
        if (this.updateErrorHandler) {
            ipcRenderer.removeListener('error', this.updateErrorHandler);
        }
    }

    onOk = () => {
        ipcRenderer.send('download-update', '111');
        this.setState({ type: 'hidden' });
    };

    onCancel = () => {
        this.setState({ type: 'hidden' });
    };

    notifyDownloaded = () => {
        const args = {
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
