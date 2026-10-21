import { app } from 'electron';
import { readSettingValueSync } from './db';
import './worker/fork';

// Reads SQLite when it exists, or the pre-migration setting.nedb on the first
// start. This must run before app.ready, so it deliberately does not open the
// long-lived database connection.
const useHardwareAcceleration = readSettingValueSync<boolean>('useHardwareAcceleration');
if (!useHardwareAcceleration) {
    if (process.platform !== 'darwin') {
        app.commandLine.appendSwitch('disable-gpu');
        app.commandLine.appendSwitch('disable-software-rasterizer');
    }
    app.disableHardwareAcceleration();
}

// Fix setTimeout not reliable problem
// See https://github.com/electron/electron/issues/7079#issuecomment-325706135
app.commandLine.appendSwitch('disable-background-timer-throttling');
import('./init');
