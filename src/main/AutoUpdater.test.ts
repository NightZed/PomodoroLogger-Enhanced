import { autoUpdater } from 'electron-updater';
import { AutoUpdater } from './AutoUpdater';
import { UpdateEventName } from './ipc/type';

// electron-updater requires `electron`, which is not available in the plain Node
// environment used by jest, so it is replaced by a plain event emitter.
jest.mock('electron-updater', () => {
    const { EventEmitter } = require('events');
    const updater: any = new EventEmitter();
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.logger = null;
    updater.setFeedURL = jest.fn();
    updater.checkForUpdates = jest.fn(() => Promise.resolve(null));
    updater.downloadUpdate = jest.fn(() => Promise.resolve([]));
    updater.quitAndInstall = jest.fn();
    return { autoUpdater: updater };
});

describe('AutoUpdater', () => {
    const mockUpdater = autoUpdater as any;

    function createUpdater() {
        const events: { type: string; info: any }[] = [];
        const updater = new AutoUpdater((type: string, info: any) => {
            events.push({ type, info });
        });

        return { updater, events };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        // AutoUpdater registers its listeners on the shared autoUpdater instance
        mockUpdater.removeAllListeners();
    });

    it('should report one failure with a single event', () => {
        const { updater, events } = createUpdater();

        updater.checkUpdate(true);
        mockUpdater.emit('error', new Error('network is unreachable'));

        // Regression: the same error used to be forwarded twice, which made the
        // renderer show two identical notifications.
        expect(events).toEqual([
            {
                type: UpdateEventName.Error,
                info: { phase: 'check', message: 'network is unreachable' },
            },
        ]);
    });

    it('should stay quiet while a new release has no channel file yet', () => {
        const { updater, events } = createUpdater();

        updater.checkUpdate();
        const err: any = new Error('Cannot find latest.yml in the latest release artifacts');
        err.code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND';
        mockUpdater.emit('error', err);

        expect(events).toEqual([]);
    });

    it('should explain the missing channel file to a manual check', () => {
        const { updater, events } = createUpdater();

        updater.checkUpdate(true);
        const err: any = new Error('Cannot find latest.yml in the latest release artifacts');
        err.code = 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND';
        mockUpdater.emit('error', err);

        expect(events).toEqual([
            {
                type: UpdateEventName.Error,
                info: {
                    phase: 'check',
                    message:
                        'The release artifacts are still being uploaded, please try again later',
                },
            },
        ]);
    });

    it('should only log errors of the automatic background check', () => {
        const { updater, events } = createUpdater();

        updater.checkUpdate();
        mockUpdater.emit('error', new Error('offline'));

        expect(events).toEqual([]);
    });

    it('should mark download failures as download phase', () => {
        const { updater, events } = createUpdater();

        updater.download();
        mockUpdater.emit('error', new Error('download aborted'));

        expect(events).toEqual([
            {
                type: UpdateEventName.Error,
                info: { phase: 'download', message: 'download aborted' },
            },
        ]);
    });

    it('should join release notes given as an array', () => {
        const { events } = createUpdater();

        mockUpdater.emit('update-available', {
            version: '1.2.3',
            releaseName: 'v1.2.3',
            releaseNotes: [{ version: '1.2.3', note: 'first note' }, { note: 'second note' }],
        });

        expect(events).toEqual([
            {
                type: UpdateEventName.Available,
                info: {
                    version: '1.2.3',
                    releaseName: 'v1.2.3',
                    releaseNotes: 'first note\n\nsecond note',
                },
            },
        ]);
    });

    it('should keep release notes given as a string', () => {
        const { events } = createUpdater();

        mockUpdater.emit('update-available', {
            version: '1.2.3',
            releaseName: 'v1.2.3',
            releaseNotes: 'plain note',
        });

        expect(events[0].info.releaseNotes).toBe('plain note');
    });

    it('should not check twice in parallel', () => {
        const { updater } = createUpdater();

        updater.checkUpdate(true);
        updater.checkUpdate(true);

        expect(mockUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('should swallow the rejection of electron-updater', async () => {
        const { updater } = createUpdater();
        mockUpdater.checkForUpdates.mockImplementationOnce(() =>
            Promise.reject(new Error('check failed'))
        );

        updater.checkUpdate(true);
        mockUpdater.emit('error', new Error('check failed'));

        // no unhandled rejection should be raised by the bare call above
        await Promise.resolve();
    });

    it('should install non-silently so the installer shows its progress banner', () => {
        const { updater } = createUpdater();

        updater.quitAndInstall();

        // Non-silent installs show the native NSIS progress banner and always
        // relaunch the app when the installation finishes (electron-updater forces
        // isForceRunAfter for non-silent installs).
        expect(mockUpdater.quitAndInstall).toHaveBeenCalledWith(false);
    });

    it('should mark install failures as install phase', () => {
        const { updater, events } = createUpdater();

        updater.quitAndInstall();
        mockUpdater.emit('error', new Error('no valid update available'));

        expect(events).toEqual([
            {
                type: UpdateEventName.Error,
                info: { phase: 'install', message: 'no valid update available' },
            },
        ]);
    });
});
