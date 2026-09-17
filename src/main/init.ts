import { nativeImage, Tray, BrowserWindow, Menu, ipcMain, MenuItem, app } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as db from './db';
import logo from '../res/icon_sm.png';
import fs from 'fs';
import { dbBaseDir } from '../config';
import { build } from '../../package.json';
import { AutoUpdater } from './AutoUpdater';
import { initialize } from './ipc/ipc';
import { IpcEventName, UpdateEventName } from './ipc/type';
import * as remoteMain from '@electron/remote/main';
import { initActiveWin } from './activeWin';
remoteMain.initialize();

const { refreshDbs, loadDBs } = db;
export let win: BrowserWindow | undefined;

/**
 * Update events can be emitted before the renderer registered its listeners
 * (`win.loadURL` is asynchronous), so they are queued until the page is loaded.
 */
let rendererReady = false;
const pendingUpdateEvents: { type: string; info: any }[] = [];

function flushUpdateEvents() {
    rendererReady = true;
    while (pendingUpdateEvents.length > 0 && win) {
        const { type, info } = pendingUpdateEvents.shift()!;
        win.webContents.send(type, info);
    }
}

export const gotTheLock = process.env.NODE_ENV !== 'production' || app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

const mGlobal: typeof global & {
    sharedDB?: typeof db.DBs;
    utils?: {
        refreshDbs: typeof refreshDbs;
        loadDBs: typeof loadDBs;
    };
    tray?: Tray;
    setMenuItems?: any;
    learner?: any;
} = global;
mGlobal.sharedDB = db.DBs;
mGlobal.utils = {
    refreshDbs,
    loadDBs,
};
if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron.time-logger');
}

const createWindow = async () => {
    win = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 380,
        minHeight: 63,
        frame: true,
        useContentSize: false,
        icon: nativeImage.createFromPath(path.join(__dirname, logo)),
        title: 'Pomodoro Logger',
        webPreferences: {
            nodeIntegrationInWorker: true,
            nodeIntegration: true,
            contextIsolation: false,
            // preload: path.join(__dirname, 'preload.js'),
        },
    });

    remoteMain.enable(win.webContents);
    win.removeMenu();
    if (process.env.NODE_ENV === 'production') {
        win.removeMenu();
    }

    if (process.env.NODE_ENV === 'development') {
        win.loadURL(`http://localhost:2003`);
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        win.loadURL(
            url.format({
                pathname: path.join(__dirname, 'index.html'),
                protocol: 'file:',
                slashes: true,
            })
        );
    }

    rendererReady = false;
    win.webContents.once('did-finish-load', flushUpdateEvents);

    const handleRedirect = (e: any, url: string) => {
        if (url !== win?.webContents.getURL()) {
            e.preventDefault();
            require('electron').shell.openExternal(url);
        }
    };

    win.webContents.on('will-navigate', handleRedirect);
    win.webContents.on('new-window', handleRedirect);

    win.on('close', (event: Event) => {
        if (win) {
            win.hide();
            event.preventDefault();
        }
    });

    ipcMain.addListener(IpcEventName.Quit, () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('receive quit-app');
            return;
        }

        win = undefined;
        app.exit();
    });

    ipcMain.addListener(IpcEventName.Restart, restart);

    ipcMain.addListener(IpcEventName.SetTray, (event: any, src: string) => {
        const pngBuffer = nativeImage.createFromDataURL(src).toPNG();
        const imgFile = path.join(dbBaseDir, 'tray@2x.png');
        fs.writeFile(imgFile, pngBuffer, {}, () => {
            mGlobal.tray?.setImage(imgFile);
        });
    });

    if (process.platform === 'darwin') {
        let forceQuit = false;
        app.on('before-quit', () => {
            forceQuit = true;
        });

        win.on('close', (event) => {
            if (!forceQuit) {
                event.preventDefault();
                return;
            }

            win = undefined;
            app.exit();
        });
    }

    setTimeout(initActiveWin, 2000);
};
app.on('ready', async () => {
    if (!gotTheLock) {
        return;
    }

    const img = nativeImage.createFromPath(path.join(__dirname, logo));
    img.resize({ width: 16, height: 16 });
    mGlobal.tray = new Tray(img);
    const menuItems = [
        {
            label: 'Quit',
            type: 'normal',
            click: () => {
                app.quit();
            },
        },
    ];

    // @ts-ignore
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setToolTip('Pomodoro Logger');
    if (process.platform === 'darwin') {
        mGlobal.tray.on('click', async () => {
            if (!win) {
                await createWindow();
            } else {
                win.show();
            }
        });
    } else {
        mGlobal.tray.setContextMenu(contextMenu);
        mGlobal.tray.on('double-click', async () => {
            if (!win) {
                await createWindow();
            } else {
                win.show();
            }
        });
    }

    await db.loadDBs(['settingDB']);

    await createWindow();

    db.DBs.settingDB.findOne({ name: 'setting' }, (err, settings) => {
        if (err) {
            console.error(err);
            return;
        }

        if (settings != null && 'autoUpdate' in settings && !settings.autoUpdate) {
            return;
        }

        // An unpackaged app cannot install an update and electron-updater would
        // still hit the network, so only check when running a packaged build.
        if (!app.isPackaged) {
            console.log('[updater] skip update check: application is not packaged');
            return;
        }

        autoUpdaterCheck.checkUpdate();
    });
});

export function restart(): void {
    if (process.env.NODE_ENV === 'development') {
        console.log('receive restart-app');
        return;
    }

    win = undefined;
    app.relaunch();
    app.exit();
}

function update() {
    const sendStatusToWindow = (type: string, info: any) => {
        if (type === UpdateEventName.Progress) {
            const { percent } = info;
            if (win && typeof percent === 'number') {
                win.setProgressBar(percent / 100);
            }
        }

        if (type === UpdateEventName.Downloaded || type === UpdateEventName.Error) {
            if (win) {
                win.setProgressBar(-1);
            }
        }

        if (!win) {
            return;
        }

        // The renderer registers its listeners on mount, queue until it is ready.
        if (!rendererReady) {
            pendingUpdateEvents.push({ type, info });
            return;
        }

        win.webContents.send(type, info);
    };

    const autoUpdater = new AutoUpdater(sendStatusToWindow);

    ipcMain.on(IpcEventName.DownloadUpdate, () => {
        autoUpdater.download();
    });

    ipcMain.on(IpcEventName.CheckUpdate, () => {
        autoUpdater.checkUpdate(true);
    });

    return autoUpdater;
}

// updater instance is created once so manual check works even when auto update is off
const autoUpdaterCheck = update();
function setMenuItems(items: { label: string; type: string; click: any }[]) {
    if (!mGlobal.tray) {
        return;
    }

    const menuItems = items.concat([
        new MenuItem({
            type: 'separator',
        }),
        {
            label: 'Open',
            type: 'normal',
            click: () => {
                if (win) {
                    win.show();
                }
            },
        },
        {
            label: 'Quit',
            type: 'normal',
            click: () => {
                win = undefined;
                app.exit();
            },
        },
    ]);
    // @ts-ignore
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setContextMenu(contextMenu);
}
mGlobal.setMenuItems = setMenuItems;
app.on('window-all-closed', () => {
    win = undefined;
    app.exit();
});
app.on('activate', () => {
    if (!win) {
        app.setName(build.productName);
        createWindow();
    } else {
        win.show();
    }
});
initialize();
