import {
    nativeImage,
    Tray,
    BrowserWindow,
    protocol,
    Menu,
    ipcMain,
    MenuItem,
    app,
    nativeTheme,
    shell,
} from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as db from './db';
import logo from '../res/icon_sm.png';
import fs from 'fs';
import { dbBaseDir, dbPaths } from '../config';
import { DAY_THEME_ID } from '../renderer/theme/tokens';
import { build } from '../../package.json';
import { AutoUpdater } from './AutoUpdater';
import { initialize } from './ipc/ipc';
import { IpcEventName, UpdateEventName, WindowEventName } from './ipc/type';
import { stopWindowDrag } from './ipc/windowDrag';
import * as remoteMain from '@electron/remote/main';
import { initActiveWin } from './activeWin';
remoteMain.initialize();

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'wallpaper',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

const { refreshDbs, loadDBs } = db;
export let win: BrowserWindow | undefined;

/**
 * What the taskbar entry should be while the window is open. The mini bar
 * asks for `setSkipTaskbar(true)` through IpcEventName.MinimizeWindow (see
 * `setSkipTaskbar`); `closeToTray` forces it on the way down and hands this
 * record back on the way up, because `BrowserWindow` has no `isSkipTaskbar`
 * getter to ask the window what it currently has.
 */
let skipTaskbarWanted = false;
/**
 * Whether `closeToTray` turned the taskbar entry off itself (i.e. the window
 * was not already skipped by mini mode) and therefore owes the window a
 * `setSkipTaskbar(skipTaskbarWanted)` on the way back up.
 */
let forcedSkipTaskbar = false;

/**
 * The single place the window's taskbar entry is controlled from, so
 * close-to-tray can restore exactly the state the window was closed with
 * (see `forcedSkipTaskbar`).
 */
export function setSkipTaskbar(on: boolean): void {
    skipTaskbarWanted = on;
    win?.setSkipTaskbar(on);
}

/**
 * Windows close-to-tray: minimize instead of hide.
 *
 * Hiding a `transparent: true` window and showing it again makes Windows
 * rebuild the window's compositor surface: the window appears for ~100ms,
 * vanishes and appears again (electron/electron#35044, #22691, #10069 --
 * Windows-only, closed as stale upstream, so there is no fix to wait for).
 * `transparent: false` windows are unaffected, but this app needs the
 * transparency, so the way out is to never hide the window: `minimize()`
 * keeps the surface alive and does not flicker (verified side by side
 * against `hide()` in the experiment that produced this).
 *
 * `setSkipTaskbar(true)` hides the taskbar entry that `hide()` used to drop
 * on its own; mini mode is left alone since it already asked for it.
 * `revealWindow` puts back whatever the window had.
 */
function closeToTray(): void {
    if (!win) {
        return;
    }

    if (!skipTaskbarWanted) {
        win.setSkipTaskbar(true);
        forcedSkipTaskbar = true;
    }

    win.minimize();
}

/**
 * Bring the window back from the tray: a tray left click, the tray's Open
 * entry, a second instance, the session-reminder notification. `show()` alone
 * does not un-minimize a window that `closeToTray` put away, so restore
 * first, hand back the taskbar entry, then show + focus. On macOS/Linux the
 * window was hidden (not minimized), so the restore is skipped and this is
 * show + focus.
 */
export function revealWindow(): void {
    if (!win) {
        return;
    }

    if (win.isMinimized()) {
        win.restore();
    }

    if (forcedSkipTaskbar) {
        win.setSkipTaskbar(skipTaskbarWanted);
        forcedSkipTaskbar = false;
    }

    win.show();
    win.focus();
}

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

/**
 * Tells the renderer whether the window is maximized, so its caption buttons can
 * show maximize or restore (see `WindowEventName.MaximizedChanged`).
 *
 * On Windows a transparent window is not a real maximized window: Electron
 * emulates the state by resizing the window to the display work area (see
 * `NativeWindowViews::Maximize`), which is why the window's `resize` event
 * reports the state as well -- the explicit toggles emit `maximize` and
 * `unmaximize` on top of that. Only changes travel: `resize` fires on every
 * frame of a manual edge resize.
 *
 * `undefined` means "send unconditionally", which is also what a new window (or
 * a reload) needs: the pushed events only report changes.
 */
let lastNotifiedMaximized: boolean | undefined;

function notifyWindowState(): void {
    if (!win) {
        return;
    }

    const maximized = win.isMaximized();
    if (maximized === lastNotifiedMaximized) {
        return;
    }

    lastNotifiedMaximized = maximized;
    win.webContents.send(WindowEventName.MaximizedChanged, maximized);
}

// In development, isolate userData to prevent locking conflicts with installed / production app
if (process.env.NODE_ENV !== 'production') {
    const devUserData = path.join(app.getPath('appData'), `${build.productName}-Dev`);
    app.setPath('userData', devUserData);
}

export const gotTheLock = process.env.NODE_ENV !== 'production' || app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, we should show and focus
        // our window (un-minimize it first if it is away in the tray).
        revealWindow();
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

/**
 * Settings live in a single nedb document that is persisted as one JSON object
 * per line, so the last line holds the most recent state. Reading it
 * synchronously lets the window pick the right background color (and the right
 * `prefers-color-scheme`) before anything is painted, which avoids a white
 * flash when the night theme is active.
 */
function readThemeSetting(): { themeId?: string; followSystemTheme?: boolean } {
    try {
        const content = fs.readFileSync(dbPaths.settingDB, { encoding: 'utf-8' });
        const lines = content.split('\n').filter((line) => !!line);
        if (lines.length === 0) {
            return {};
        }

        const latest = JSON.parse(lines[lines.length - 1]);
        return { themeId: latest.themeId, followSystemTheme: latest.followSystemTheme };
    } catch (e) {
        return {};
    }
}

const createWindow = async () => {
    const { themeId, followSystemTheme } = readThemeSetting();
    nativeTheme.themeSource = followSystemTheme
        ? 'system'
        : themeId === DAY_THEME_ID
        ? 'light'
        : 'dark';

    win = new BrowserWindow({
        width: 1440,
        height: 960,
        // Content-size minimums: the mini bar occupies exactly 200x90 of
        // content (see ipc.ts setContentSize), so the window must never be
        // resizable below that or the bar would be clipped.
        minWidth: 200,
        minHeight: 90,
        // Frameless: the title bar is drawn by the renderer (WindowControls on
        // the right of the tabs row; mini mode has none). thickFrame keeps its
        // default (true), so Windows still has invisible resize borders.
        frame: false,
        transparent: true,
        useContentSize: true,
        backgroundColor: '#00000000',
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
    // Re-sent unconditionally once the page is loaded: the pushed events only
    // report changes, and the renderer registers its listener before this fires
    // (the bundle runs before `onload`).
    win.webContents.once('did-finish-load', () => {
        lastNotifiedMaximized = undefined;
        flushUpdateEvents();
        notifyWindowState();
    });

    const handleRedirect = (e: any, url: string) => {
        if (url !== win?.webContents.getURL()) {
            e.preventDefault();
            shell.openExternal(url);
        }
    };

    win.webContents.on('will-navigate', handleRedirect);
    // `new-window` was removed in Electron 22. Popups are denied and their
    // target URL is handed over to the default browser instead.
    win.webContents.setWindowOpenHandler((details) => {
        if (details.url !== win?.webContents.getURL()) {
            shell.openExternal(details.url);
        }

        return { action: 'deny' };
    });

    // Caption button state; see notifyWindowState. The `resize` event is the one
    // that reports the emulated maximize state of a transparent window, the
    // other three the explicit toggles.
    win.on('maximize', notifyWindowState);
    win.on('unmaximize', notifyWindowState);
    win.on('restore', notifyWindowState);
    win.on('resize', notifyWindowState);

    // A drag that outlives the window's focus (alt+tab in the middle of the
    // gesture) must not keep the window glued to the cursor. The renderer
    // reports the end of its gesture; these cover the case where it cannot.
    win.on('blur', stopWindowDrag);
    win.on('hide', stopWindowDrag);

    // No `Event` annotation: since Electron 39 the handler receives Electron's
    // own structural `Event` type, which is not the DOM `Event` from `lib.dom`.
    // Closing hides the window to the tray instead of destroying it. On
    // Windows that is `closeToTray()` (minimize, not hide -- see why there);
    // other platforms keep plain hide/show, which never flickered.
    win.on('close', (event) => {
        if (win) {
            event.preventDefault();
            if (process.platform === 'win32') {
                closeToTray();
            } else {
                win.hide();
            }
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
    protocol.registerFileProtocol('wallpaper', (request, callback) => {
        try {
            const wallpaperPath = new URL(request.url).searchParams.get('path');
            if (!wallpaperPath) {
                callback({ error: -6 });
                return;
            }
            callback({ path: wallpaperPath });
        } catch (error) {
            console.error('Failed to resolve wallpaper path:', error);
            callback({ error: -2 });
        }
    });

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
                revealWindow();
            }
        });
    } else {
        mGlobal.tray.setContextMenu(contextMenu);
        if (process.platform === 'win32') {
            // Windows: a single left click opens the window; the right button
            // keeps opening the menu (`setContextMenu`). Electron emits
            // `click` from WM_LBUTTONDOWN on this platform (see
            // NotifyIconHost::WndProc), so the window appears on press. A
            // double-click needs no handler of its own: the first press
            // already opens the window and the second press is a harmless
            // repeat (`revealWindow` is idempotent).
            mGlobal.tray.on('click', async () => {
                if (!win) {
                    await createWindow();
                } else {
                    revealWindow();
                }
            });
        }
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

    ipcMain.on(IpcEventName.InstallUpdate, () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('receive install-update');
            return;
        }

        // Drop the window reference first: the win32 `close` handler hides the
        // window and cancels the close, which would abort the `app.quit()` that
        // quitAndInstall() triggers right after spawning the installer.
        win = undefined;
        autoUpdater.quitAndInstall();
    });

    return autoUpdater;
}

// updater instance is created once so manual check works even when auto update is off
const autoUpdaterCheck = update();
/**
 * (Re)builds the tray context menu from the entries the renderer asks for (see
 * `Timer.addMenuItems`). The separator and the Open/Quit entries belong to the
 * window and are appended here, so a state dependent menu can neither grey them
 * out nor reorder them. `enabled: false` renders an entry greyed out; it is how
 * the renderer says "this action cannot run right now".
 */
function setMenuItems(items: { label: string; type: string; click: any; enabled?: boolean }[]) {
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
                revealWindow();
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
        revealWindow();
    }
});
initialize();
