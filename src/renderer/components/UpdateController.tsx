import * as React from 'react';
import { Button } from 'antd';
import type { UpdateErrorPayload, UpdateInfoPayload } from '../../main/ipc/type';
import { feedback, FEEDBACK_MESSAGES } from './feedback';
import formatMarkdown from './Kanban/Card/formatMarkdown';

const RELEASE_PAGE = 'https://github.com/NightZed/PomodoroLogger-Enhanced/releases';
// Fixed keys keep repeated events from stacking up identical notices.
const ERROR_NOTIFICATION_KEY = 'update-error';
const PROGRESS_NOTIFICATION_KEY = 'update-progress';
const DOWNLOADED_NOTIFICATION_KEY = 'update-downloaded';

/**
 * Bridges the update events of the main process into the feedback layer.
 *
 * The whole pipeline reports through the same two channels: the background
 * phases (progress / downloaded / failed) as notices in the top right, the two
 * decisions (start downloading, acknowledge the install) as centered dialogs.
 * Nothing is rendered by this component itself.
 */
export class UpdateController extends React.Component<any> {
    private unsubscribers: Array<() => void> = [];

    componentDidMount() {
        this.unsubscribers.push(
            window.api.onUpdateAvailable((info) => this.notifyAvailable(info)),
            window.api.onUpdateDownloaded(() => {
                feedback.closeNotice(PROGRESS_NOTIFICATION_KEY);
                this.notifyDownloaded();
            }),
            window.api.onUpdateProgress((info) => {
                feedback.notice({
                    key: PROGRESS_NOTIFICATION_KEY,
                    kind: 'info',
                    title: FEEDBACK_MESSAGES.update.downloading,
                    description: `${Math.round(info.percent)}%`,
                });
            }),
            window.api.onUpdateError((payload) => this.onUpdateError(payload))
        );
    }

    componentWillUnmount() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unsubscribers = [];
    }

    onUpdateError = (payload: UpdateErrorPayload) => {
        if (payload?.skipped) {
            // Not a failure: the page that asked for the check reports it
            // itself (see AutoUpdater.checkUpdate), so the app wide notice
            // would only duplicate it.
            return;
        }

        const { update } = FEEDBACK_MESSAGES;
        const phase =
            payload?.phase === 'download'
                ? update.phase.download
                : payload?.phase === 'install'
                  ? update.phase.install
                  : update.phase.check;
        feedback.closeNotice(PROGRESS_NOTIFICATION_KEY);
        feedback.notice({
            key: ERROR_NOTIFICATION_KEY,
            kind: 'error',
            title: update.failed(phase),
            description: (
                <div>
                    <div style={{ marginBottom: 4 }}>{payload?.message}</div>
                    <div>
                        {update.manualDownloadHint}{' '}
                        <a href={RELEASE_PAGE} target="_blank" rel="noreferrer">
                            {RELEASE_PAGE}
                        </a>
                    </div>
                </div>
            ),
        });
    };

    /**
     * Announces an available update and asks whether to download it. The release
     * notes are rendered as markdown, so the dialog can get tall: the notes
     * scroll on their own instead of stretching the dialog.
     */
    notifyAvailable = (info: UpdateInfoPayload) => {
        const { update } = FEEDBACK_MESSAGES;
        feedback.confirm({
            kind: 'info',
            title: update.available,
            width: 460,
            okText: update.downloadNow,
            content: (
                <div>
                    <p style={{ marginBottom: 8 }}>{update.availableIntro}</p>
                    <p style={{ marginBottom: 8 }}>
                        {update.versionLabel}: {info.version}
                        {info.releaseName ? `; ${info.releaseName}` : ''}
                    </p>
                    {info.releaseNotes ? (
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
                                __html: formatMarkdown(info.releaseNotes),
                            }}
                        />
                    ) : null}
                    <p style={{ margin: 0 }}>{update.availableQuestion}</p>
                </div>
            ),
            onOk: this.onDownload,
        });
    };

    onDownload = () => {
        window.api.downloadUpdate();
    };

    notifyDownloaded = () => {
        const { update } = FEEDBACK_MESSAGES;
        feedback.notice({
            key: DOWNLOADED_NOTIFICATION_KEY,
            kind: 'success',
            title: update.downloaded,
            description: update.downloadedDescription,
            actions: (
                <Button type="primary" size="small" onClick={this.onInstallNow}>
                    {update.restartAndInstall}
                </Button>
            ),
        });
    };

    onInstallNow = () => {
        const { update } = FEEDBACK_MESSAGES;
        feedback.closeNotice(DOWNLOADED_NOTIFICATION_KEY);
        // Explain what is about to happen; the NSIS installer takes over (with its
        // native progress banner) right after the app quits, and the dialog is
        // dismissed along with the process. The OK button stays available so this
        // dialog can still be closed during development, where the install request
        // is only logged.
        feedback.alert({
            kind: 'info',
            title: update.installing,
            content: update.installingDescription,
        });
        setTimeout(() => {
            window.api.installUpdate();
        }, 1500);
    };

    render() {
        // The update pipeline talks through the feedback layer only.
        return null;
    }
}
