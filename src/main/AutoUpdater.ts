import { autoUpdater, UpdateInfo } from 'electron-updater';
import { GithubOptions } from 'builder-util-runtime';
import { UpdateErrorPayload, UpdateEventName, UpdatePhase } from './ipc/type';

/**
 * Thin wrapper around electron-updater.
 *
 * electron-updater emits a single `error` event for both the check phase and the
 * download phase, so the failing phase is tracked here and forwarded to the
 * renderer together with the error, which lets the UI show a meaningful message
 * ("check failed" vs "download failed") instead of always blaming the download.
 */
export class AutoUpdater {
    private phase: UpdatePhase = 'check';
    private checking = false;
    private manualCheck = false;
    private readonly sendStatusToWindow: (type: string, info: any) => void;

    constructor(sendStatusToWindow: (type: string, info: any) => void) {
        this.sendStatusToWindow = sendStatusToWindow;
        this.init();
    }

    init() {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;
        // Route electron-updater diagnostics through console so failures are traceable.
        autoUpdater.logger = console;

        autoUpdater.on('checking-for-update', () => {
            console.log('Checking for update...');
        });
        autoUpdater.on('update-available', (info) => {
            console.log('update available');
            const releaseNotes = formatReleaseNotes(info.releaseNotes);
            this.sendStatusToWindow(UpdateEventName.Available, {
                releaseNotes,
                version: info.version,
                releaseName: info.releaseName,
            });
        });
        autoUpdater.on('update-not-available', (info) => {
            console.log('update not available');
            this.sendStatusToWindow(
                UpdateEventName.NotAvailable,
                `You are using the latest version (v${info.version})`
            );
        });

        autoUpdater.on('error', (err) => {
            // NOTE: electron-updater emits `error` once per failure, and the same
            // event is used for both the check phase and the download phase.
            // Sending it twice used to show two identical notifications.
            this.reportError(err);
        });
        autoUpdater.on('download-progress', (progressObj) => {
            let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
            log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
            log_message =
                log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
            console.log(log_message);
            this.sendStatusToWindow(UpdateEventName.Progress, {
                percent: progressObj.percent,
                bytesPerSecond: progressObj.bytesPerSecond,
            });
        });
        autoUpdater.on('update-downloaded', (info) => {
            console.log(info);
            this.sendStatusToWindow(UpdateEventName.Downloaded, 'Update downloaded');
        });
    }

    /**
     * @param manual whether the user triggered the check explicitly (Settings page).
     *               Errors of an automatic background check are only logged, because
     *               a transient network failure is not worth a notification.
     */
    checkUpdate(manual = false) {
        if (this.checking) {
            console.log('Update check already in progress, skip');
            return;
        }

        const data = {
            provider: 'github',
            owner: 'nightzed',
            repo: 'PomodoroLogger-Enhanced',
        } as GithubOptions;

        this.phase = 'check';
        this.manualCheck = manual;
        this.checking = true;
        autoUpdater.setFeedURL(data);
        // electron-updater re-throws after emitting `error`, swallow it here to avoid
        // an unhandled rejection in the main process.
        autoUpdater
            .checkForUpdates()
            .catch(() => undefined)
            .then(() => {
                this.checking = false;
            });
    }

    download() {
        this.phase = 'download';
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.downloadUpdate().catch(() => undefined);
    }

    /**
     * Quit the app and run the downloaded installer.
     *
     * The install is non-silent so the NSIS one-click installer shows its native
     * progress banner during installation; electron-updater forces `isForceRunAfter`
     * to true for non-silent installs (`BaseUpdater.quitAndInstall`:
     * `isSilent ? isForceRunAfter : true`), so the updated app starts automatically
     * once the installer finishes. There is no in-app progress for this phase: the
     * app must quit before its files can be replaced, and a silent installer
     * (`quitAndInstall(true, true)`) exposes no progress callback at all.
     */
    quitAndInstall() {
        this.phase = 'install';
        autoUpdater.quitAndInstall(false);
    }

    private reportError(err: any) {
        console.error('[updater] error in', this.phase, 'phase:', err);

        if (this.phase === 'check' && !this.manualCheck) {
            // Background check on startup: never bother the user. This also covers
            // the window between semantic-release creating a release and the build
            // workflow uploading its artifacts (latest.yml / latest-mac.yml), where
            // a perfectly up to date app would otherwise report a failure.
            return;
        }

        const isChannelFileMissing = err?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND';
        const payload: UpdateErrorPayload = {
            phase: this.phase,
            message: isChannelFileMissing
                ? 'The release artifacts are still being uploaded, please try again later'
                : err?.message ?? String(err),
        };
        this.sendStatusToWindow(UpdateEventName.Error, payload);
    }
}

/**
 * electron-updater returns release notes either as a plain string, as a single
 * `{ version, note }` object or as an array of them (`fullChangelog`).
 */
function formatReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | undefined {
    if (releaseNotes == null) {
        return undefined;
    }

    if (typeof releaseNotes === 'string') {
        return releaseNotes;
    }

    if (Array.isArray(releaseNotes)) {
        const notes = releaseNotes.map((it: any) => it?.note).filter((it: any) => Boolean(it));
        return notes.length > 0 ? notes.join('\n\n') : undefined;
    }

    return (releaseNotes as any).note;
}
