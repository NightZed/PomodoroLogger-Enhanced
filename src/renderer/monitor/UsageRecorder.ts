import { PomodoroRecord } from './type';
import { ActiveWinListener } from './activeWinMonitor';
import type { BaseResult } from 'active-win';
import { cloneDeep } from 'lodash';
import { uid } from '../../utils/uid';

function removeAppSuffix(name: string) {
    return name.replace(/\.exe$/g, '');
}

export type Listener = (appName: string, data: PomodoroRecord, imgUrl?: string) => void;
export class UsageRecorder {
    private record: PomodoroRecord;
    private lastUsingApp?: string;
    private lock: boolean = false;
    private maxIndex: number = 0;
    private lastUpdateTime: number | undefined = undefined;
    public isRunning: boolean = false;

    private lastScreenShotUrl?: string;
    private readonly monitorListener: Listener;

    constructor(monitorListener: Listener) {
        this.record = {
            _id: uid(),
            switchActivities: [],
            stayTimeInSecond: [],
            apps: {},
            spentTimeInHour: 0,
            switchTimes: 0,
            startTime: 0,
        };

        this.monitorListener = monitorListener;
    }

    get sessionData() {
        if (this.isRunning) {
            this.stop();
        }

        this.normalizeTitleSpentTime();
        return cloneDeep(this.record);
    }

    /**
     * Paths of the screenshots recorded so far. Read by `Monitor.discard`
     * BEFORE `clear()` drops the record, so the files can leave the disk
     * together with the record that referenced them.
     */
    get screenshotPaths(): string[] {
        return (this.record.screenshots ?? []).map((s) => s.path);
    }

    clear = () => {
        this.record = {
            _id: uid(),
            switchActivities: [],
            stayTimeInSecond: [],
            apps: {},
            spentTimeInHour: 0,
            switchTimes: 0,
            startTime: 0,
        };

        this.maxIndex = 0;
        this.isRunning = false;
        this.lastUpdateTime = undefined;
        // A fresh record starts with no "current app": a stale reference would
        // count a phantom switch on the next tick (`updateLastAppUsageInfo`
        // against an app the new record never saw).
        this.lastUsingApp = undefined;
    };

    start = () => {
        this.record.startTime = new Date().getTime();
        this.lastUpdateTime = this.record.startTime;
        // Same defensive reset as `clear()`: no app observed yet, so the
        // first tick after a (re)start can never look like a switch.
        this.lastUsingApp = undefined;
        this.isRunning = true;
    };

    resume = () => {
        this.lastUpdateTime = new Date().getTime();
        this.isRunning = true;
    };

    stop = () => {
        if (this.isRunning) {
            // Commit the time the last app was seen up to this moment.
            if (this.lastUsingApp) {
                this.updateThisAppUsageInfo(this.lastUsingApp);
            }

            // Ending the recording is NOT an app switch. The old
            // `this.listener(undefined)` round-trip ran
            // `updateLastAppUsageInfo`, which counted `switchTimes += 1` on
            // every pause and again at every session end. `lastUsingApp` is
            // deliberately KEPT though: it is the baseline the first tick
            // after `resume()` compares against, so a switch that really
            // happened during the pause is still counted (exactly once), and
            // resuming into the same app counts nothing. `clear()`/`start()`
            // reset it for the next session.
        }

        this.lastUpdateTime = undefined;
        this.isRunning = false;
    };

    /**
     * Record one monitor tick.
     *
     * @param result, the active window; absent means "nothing to record"
     * @param screenshot, the path to screenshot
     */
    listener: ActiveWinListener = async (result?: BaseResult, screenshot?: string) => {
        // Because we await something here, and
        // this method is call at an interval, there are chances
        // that we run call the method before last call is done;
        // I use a lock to avoid that.
        if (this.lock) {
            console.warn('Locked! The update interval is too short.');
            return;
        }

        // An in-flight `watch()` may deliver its result after `stop()` (the
        // pause button, Stop, or the natural end of the session): the tick
        // belongs to the paused/finished session, so nothing may be recorded.
        // The old code pushed the screenshot BEFORE this guard, which let one
        // late frame into the record with a paused timestamp.
        if (!result || !this.isRunning) {
            return;
        }

        if (screenshot) {
            if (this.record.screenshots == null) {
                this.record.screenshots = [];
            }

            this.record.screenshots.push({
                time: new Date().getTime(),
                path: screenshot,
            });
        }

        const appName = removeAppSuffix(result.owner.name);
        // Switching apps counts one switch. Resuming into a different app
        // counts too -- `stop()` keeps `lastUsingApp` precisely so this tick
        // can tell a real switch (once) from staying in the same app.
        if (this.lastUsingApp && appName !== this.lastUsingApp) {
            this.updateLastAppUsageInfo(this.lastUsingApp);
        }

        this.lock = true;
        if (!(appName in this.record.apps)) {
            this.record.apps[appName] = {
                appName,
                spentTimeInHour: 0,
                titleSpentTime: {},
            };
        }

        this.updateThisAppUsageInfo(appName, result.title);
        this.lastUsingApp = appName;
        this.monitorListener(appName, this.record, this.lastScreenShotUrl);
        this.lock = false;
    };

    private updateLastAppUsageInfo = (lastAppName: string) => {
        const row = this.record.apps[lastAppName];
        if (!row) {
            console.error(
                `App "${lastAppName}" does not exists in ${JSON.stringify(this.record.apps)}`
            );
        }

        this.record.switchTimes += 1;
        this.lastUsingApp = undefined;
    };

    updateThisAppUsageInfo = (appName: string, title: string = appName) => {
        const row = this.record.apps[appName];
        const now = new Date().getTime();
        if (!row) {
            const spentTimeInHour = (now - this.lastUpdateTime!) / 1000 / 3600;
            this.record.spentTimeInHour += spentTimeInHour;
            this.lastUpdateTime = now;
            return;
        }

        // Count the title occurrences.
        // This should be normalized when session finished.
        if (!(title in row.titleSpentTime)) {
            row.titleSpentTime[title] = {
                index: this.maxIndex,
                normalizedWeight: 0,
                occurrence: 0,
            };

            this.maxIndex += 1;
        }

        row.titleSpentTime[title].occurrence += 1;

        if (this.lastUpdateTime == null) {
            throw new Error('You should start recorder before using it');
        }

        const spentTimeInHour = (now - this.lastUpdateTime!) / 1000 / 3600;
        row.spentTimeInHour += spentTimeInHour;
        this.record.spentTimeInHour += spentTimeInHour;
        this.updateSwitchActivity(row.titleSpentTime[title].index, now);
        this.lastUpdateTime = now;
    };

    private updateSwitchActivity = (index: number, now: number) => {
        const last = this.record.switchActivities!.length - 1;
        const stayTimeArr = this.record.stayTimeInSecond!;
        if (stayTimeArr.length !== 0) {
            stayTimeArr[stayTimeArr.length - 1] += (now - this.lastUpdateTime!) / 1000;
        }

        if (this.record.switchActivities![last] !== index) {
            this.record.switchActivities!.push(index);
            this.record.stayTimeInSecond!.push(0);
        }
    };

    private normalizeTitleSpentTime = () => {
        let totalTitleOccurrences = 0;
        for (const app in this.record.apps) {
            const titles = this.record.apps[app].titleSpentTime;
            for (const title in titles) {
                totalTitleOccurrences += titles[title].occurrence;
            }
        }

        for (const app in this.record.apps) {
            const titles = this.record.apps[app].titleSpentTime;
            for (const title in titles) {
                titles[title].normalizedWeight = titles[title].occurrence / totalTitleOccurrences;
            }
        }
    };
}
