import { Monitor as WindowMonitor } from './activeWinMonitor';
import { deleteScreenshots, renameIllegalName } from './sessionManager';
import { PomodoroRecord } from './type';
import { Listener, UsageRecorder } from './UsageRecorder';

// This module may not be available in electron renderer
export class Monitor {
    recorder: UsageRecorder;
    monitorInterval: number;
    screenShotInterval?: number;
    winMonitor: WindowMonitor;

    constructor(
        monitorListener: Listener,
        monitorInterval: number = 500,
        screenShotInterval: number | undefined = undefined
    ) {
        if (screenShotInterval && monitorInterval > screenShotInterval) {
            throw new Error('monitorInterval must be less than screenShotInterval ');
        }

        this.monitorInterval = monitorInterval;
        this.screenShotInterval = screenShotInterval;
        this.recorder = new UsageRecorder(monitorListener);
        this.winMonitor = new WindowMonitor(
            this.recorder.listener,
            this.monitorInterval,
            screenShotInterval
        );
    }

    start = () => {
        if (this.winMonitor.isRunning) {
            return;
        }

        this.recorder.start();
        this.winMonitor.start();
    };

    resume = () => {
        if (this.winMonitor.isRunning) {
            return;
        }

        this.recorder.resume();
        this.winMonitor.start();
    };

    stop = () => {
        this.winMonitor.stop();
        this.recorder.stop();
    };

    /**
     * Clear the data of current session
     */
    clear = () => {
        this.winMonitor.stop();
        this.recorder.stop();
        this.recorder.clear();
    };

    /**
     * Throw the current session away completely: stop collecting, drop the
     * record AND delete the screenshot files it had taken -- the record that
     * referenced them is gone, so the files would be orphans on disk.
     *
     * Use this whenever the session is discarded (Stop, mode switch,
     * unmount). `clear()` alone is the right call once the record has been
     * staged or saved (the ending mask): its screenshots must stay.
     */
    discard = () => {
        const screenshotPaths = this.recorder.screenshotPaths;
        this.winMonitor.stop();
        this.recorder.stop();
        this.recorder.clear();
        deleteScreenshots(screenshotPaths);
    };

    get sessionData(): PomodoroRecord {
        const data = this.recorder.sessionData;
        renameIllegalName(data);
        return data;
    }
}
