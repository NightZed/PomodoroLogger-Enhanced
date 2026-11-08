import {
    nativeImage,
    Tray,
    BrowserWindow,
    protocol,
    Menu,
    app,
    nativeTheme,
    dialog,
} from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as db from './db';
import logo from '../res/icon_sm.png';
import { DAY_THEME_ID } from '../renderer/theme/tokens';
import packageJson from '../../package.json';
import { AutoUpdater } from './AutoUpdater';
import { handleCommand, initialize } from './ipc/ipc';
import { IpcEventName, TrayEventName, UpdateEventName, WindowEventName } from './ipc/type';
import type {
    InitialLanguageSetting,
    InitialThemeSetting,
    TrayIconPayload,
    TrayMenuItem,
} from './ipc/type';
import { encodeInitialTheme } from './ipc/initialTheme';
import { encodeInitialLanguage } from './ipc/initialLanguage';
import { encodeBuildInfo } from './ipc/buildInfo';
import { languageFromLocale, isLanguagePreference } from '../shared/i18n';
import type { LanguagePreference } from '../shared/i18n';
import { m } from './i18n';
import { assertTrayIconPayload } from './ipc/validate';
import { stopWindowDrag } from './ipc/windowDrag';
import { initActiveWin } from './activeWin';
import { openExternalUrl } from './openExternal';
import { releaseWorkerNow } from './worker/fork';
import { log, logError } from './log';

const { build } = packageJson;

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
 *
 * Re-measured on Electron 44, and `hide()` is not a memory win either: under
 * the same page state the renderer's private bytes came out 77.5 MB visible,
 * 77.1 MB minimized and 77.0 MB hidden -- noise. `minimize()` already reports
 * `isVisible() === false` and drops the process to Idle priority, so Chromium
 * treats it exactly like `hide()`, and the heap behind those 77 MB is page
 * state that neither call releases. Only unmounting a page gives memory back
 * (see `DestroyOnTimeoutWrapper`). So there is nothing to trade the flicker
 * for: keep `minimize()`.
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

let windowDiagnosticsInstalled = false;

/**
 * How long the window counts as "still being resized" after the last `resize`
 * event. Long enough to bridge the gaps between the WM_SIZE messages of one
 * drag, short enough that the rounded border is back before the user looks at
 * the window again.
 */
const RESIZE_IDLE_MS = 120;

/** The renderer has been told `resizing = true` and not yet `false`. */
let resizeNotified = false;
let resizeIdleTimer: NodeJS.Timeout | undefined;

/**
 * Tells the renderer to drop the window's rounded border while the user drags
 * an edge.
 *
 * A rounded 1px frame on the element that clips the whole application costs an
 * extra full-window composite pass per frame: measured with software rendering
 * (hardware acceleration off) at 3.33 megapixels, one presented frame went from
 * 9.2 ms to 6.4 ms and from 55 to 35 quads when the border radius and the border
 * were dropped. A live resize asks for a frame every ~8 ms, so the window cannot
 * keep up at large sizes and visibly trails the cursor; without the extra pass it
 * does.
 *
 * `resize` is the trigger, not `will-resize`: the latter only fires for a resize
 * the user performs, which would leave the flag depending on two event sources
 * staying in sync -- and cannot be exercised by a scripted `MoveWindow`, so the
 * whole path would be unverifiable. The cost of using `resize` is that switching
 * to mini/compact mode or maximizing also squares the corners for
 * RESIZE_IDLE_MS; in mini mode the window is a 200x90 strip whose own content is
 * rounded anyway, and the other two happen during a window animation, so none of
 * them is visible.
 */
function notifyResizing(): void {
    if (!win || win.isDestroyed()) {
        return;
    }

    if (!resizeNotified) {
        resizeNotified = true;
        win.webContents.send(WindowEventName.ResizingChanged, true);
    }

    if (resizeIdleTimer) {
        clearTimeout(resizeIdleTimer);
    }

    resizeIdleTimer = setTimeout(() => {
        resizeIdleTimer = undefined;
        resizeNotified = false;
        if (win && !win.isDestroyed()) {
            win.webContents.send(WindowEventName.ResizingChanged, false);
        }
    }, RESIZE_IDLE_MS);
}

/**
 * Failures that happen before any JavaScript can react: a page that never
 * loaded, a preload script that threw, a renderer that stopped answering or
 * died (OOM, GPU/sandbox crash, native fault). The renderer cannot report any
 * of these itself -- if the renderer is gone, nothing in it runs -- so the main
 * process is the only witness. They all go to `crash.log`.
 */
function installWindowDiagnostics(window: BrowserWindow): void {
    const contents = window.webContents;

    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
        if (!isMainFrame) {
            return;
        }
        logError('crash', `renderer: did-fail-load ${code} ${description} ${url}`, description);
    });

    contents.on('preload-error', (_event, preloadPath, error) => {
        logError('crash', `renderer: preload failed (${preloadPath})`, error);
    });

    // A page that stops answering is recoverable, but it explains a frozen
    // window in a later bug report.
    contents.on('unresponsive', () => {
        log('crash', 'warn', 'renderer: unresponsive');
    });

    if (windowDiagnosticsInstalled) {
        return;
    }
    windowDiagnosticsInstalled = true;

    // App-level, so the record survives the window being destroyed.
    app.on('render-process-gone', (_event, _contents, details) => {
        log(
            'crash',
            'error',
            `renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`
        );
    });

    app.on('child-process-gone', (_event, details) => {
        log('app', 'warn', `child process gone: type=${details.type} reason=${details.reason}`);
    });
}

/**
 * Puts the window back into a state where the renderer's error page is
 * readable. A crash can happen in mini (200x90) or compact mode, while
 * maximized, always-on-top or hidden in the tray: in any of those the page
 * would be invisible, clipped or unreachable.
 */
export function restoreWindowForError(): void {
    if (!win || win.isDestroyed()) {
        return;
    }

    if (win.isMinimized()) {
        win.restore();
    }
    if (win.isMaximized()) {
        win.unmaximize();
    }

    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(false);
    skipTaskbarWanted = false;
    forcedSkipTaskbar = false;

    const [width, height] = win.getContentSize();
    if (width < 900 || height < 640) {
        win.setContentSize(900, 640);
    }

    win.show();
    win.focus();
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
    tray?: Tray;
    learner?: any;
} = global;
if (process.platform === 'win32') {
    // Windows groups taskbar buttons by AppUserModelID and resolves a button's
    // icon and "Properties" target through the Start-menu shortcut that owns
    // that ID. It must therefore match electron-builder's `appId`, which NSIS
    // writes onto the installed shortcut. The value used here used to be
    // `com.electron.time-logger`, inherited from the upstream project: the
    // installed app then claimed an ID owned by an `Electron.lnk` that a dev
    // run had registered, so the taskbar showed electron.exe's icon and path.
    // The dev suffix keeps development runs from ever merging with the
    // installed app again.
    app.setAppUserModelId(app.isPackaged ? build.appId : `${build.appId}.dev`);
}

/**
 * Settings are synchronously readable before the window exists. On the first
 * start after the upgrade this falls back to the old NeDB file; once the
 * migration has run it reads the SQLite settings table. Keeping this sync is
 * what lets the window pick the right background color (and the right
 * `prefers-color-scheme`) before anything is painted.
 *
 * The theme and the language share one read: `readSettingsSync` opens and
 * closes a read-only connection when the long-lived one does not exist yet.
 */
function readInitialSettings(): {
    theme: InitialThemeSetting;
    language: InitialLanguageSetting;
} {
    const settings = db.readSettingsSync();

    const storedLanguage = settings.language;
    const preference: LanguagePreference = isLanguagePreference(storedLanguage)
        ? storedLanguage
        : 'system';

    return {
        theme: {
            themeId: settings.themeId,
            followSystemTheme: settings.followSystemTheme === true,
        },
        language: {
            language: preference,
            systemLanguage: languageFromLocale(readSystemLocale()),
        },
    };
}

/** `app.getLocale()` throws before `ready`; fall back to English. */
function readSystemLocale(): string {
    try {
        return app.getLocale();
    } catch {
        return 'en';
    }
}

const createWindow = async () => {
    const initialSettings = readInitialSettings();
    const initialTheme = initialSettings.theme;
    nativeTheme.themeSource = initialTheme.followSystemTheme
        ? 'system'
        : initialTheme.themeId === DAY_THEME_ID
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
        title: m('app.title'),
        webPreferences: {
            // Renderer code only reaches the main process through the narrow
            // preload bridge (see src/main/preload.ts). Workers are pure web
            // workers now; no Node globals are available to either side.
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            // Read by the preload script and exposed as `window.api.initialTheme`
            // and `window.api.initialLanguage`, so the renderer's first paint
            // agrees with what the main process already set up instead of
            // flipping the theme / language and back.
            // `isPackaged` rides along for the same reason: the settings page
            // must know on its first render which options this build offers.
            additionalArguments: [
                encodeInitialTheme(initialTheme),
                encodeInitialLanguage(initialSettings.language),
                encodeBuildInfo(app.isPackaged),
            ],
        },
    });

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
            openExternalUrl(url);
        }
    };

    installWindowDiagnostics(win);
    win.webContents.on('will-navigate', handleRedirect);
    // `new-window` was removed in Electron 22. Popups are denied and their
    // target URL is handed over to the default browser instead.
    win.webContents.setWindowOpenHandler((details) => {
        if (details.url !== win?.webContents.getURL()) {
            openExternalUrl(details.url);
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
    // Same event as the caption-state notification above, different consumer:
    // the renderer squares off its corners while the window is being resized.
    win.on('resize', notifyResizing);

    // A drag that outlives the window's focus (alt+tab in the middle of the
    // gesture) must not keep the window glued to the cursor. The renderer
    // reports the end of its gesture; these cover the case where it cannot.
    win.on('blur', stopWindowDrag);
    win.on('hide', stopWindowDrag);

    // The aggregation child still holds the year of records it handed back.
    // Nobody is going to ask it for more while the window is out of sight, so
    // let it go now instead of waiting out its 60s idle timer. Windows reaches
    // this through `minimize()` (see `closeToTray`), the other platforms
    // through `hide()`.
    win.on('minimize', releaseWorkerNow);
    win.on('hide', releaseWorkerNow);

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

    handleCommand(IpcEventName.Quit, () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('receive quit-app');
            return;
        }

        win = undefined;
        app.exit();
    });

    handleCommand(IpcEventName.Restart, restart);

    // 方案一 + 附带清理: the renderer draws the icon at the physical size it
    // will be SHOWN at (16 logical px x display scale, see `trayCanvasSize`),
    // so the image is declared with that `scaleFactor` and the shell never
    // re-scales it -- no blur. Memory direct `setImage(dataURL-backed
    // nativeImage)` instead of the old write-tray@2x.png-then-read-path round
    // trip, which added file IO latency to every icon update.
    handleCommand(
        IpcEventName.SetTray,
        (payload: TrayIconPayload) => {
            const scaleFactor = payload.scaleFactor > 0 ? payload.scaleFactor : 1;
            const image = nativeImage.createFromBuffer(
                nativeImage.createFromDataURL(payload.src).toPNG(),
                { scaleFactor }
            );
            mGlobal.tray?.setImage(image);
        },
        [(value) => assertTrayIconPayload(value)]
    );

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
            logError('app', 'wallpaper protocol: cannot resolve the path', error);
            callback({ error: -2 });
        }
    });

    const img = nativeImage.createFromPath(path.join(__dirname, logo));
    img.resize({ width: 16, height: 16 });
    mGlobal.tray = new Tray(img);
    const menuItems = [
        {
            label: m('native.tray.quit'),
            type: 'normal',
            click: () => {
                app.quit();
            },
        },
    ];

    // @ts-ignore
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setToolTip(m('app.title'));
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

    try {
        await db.loadDBs(['settingDB']);
    } catch (error) {
        dialog.showErrorBox(
            m('native.dialog.migrationTitle'),
            m('native.dialog.migrationBody', String(error))
        );
        app.exit(1);
        return;
    }

    await createWindow();

    void (async () => {
        try {
            const settings = await db.DBs.settingDB.findOne({ name: 'setting' });
            if (settings != null && 'autoUpdate' in settings && !settings.autoUpdate) {
                return;
            }

            // An unpackaged app cannot install an update and electron-updater
            // would still hit the network, so only check when running a
            // packaged build.
            if (!app.isPackaged) {
                console.log('[updater] skip update check: application is not packaged');
                return;
            }

            autoUpdaterCheck.checkUpdate();
        } catch (error) {
            console.error(error);
        }
    })();
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

    handleCommand(IpcEventName.DownloadUpdate, () => {
        autoUpdater.download();
    });

    handleCommand(IpcEventName.CheckUpdate, () => {
        autoUpdater.checkUpdate(true);
    });

    handleCommand(IpcEventName.InstallUpdate, () => {
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
 * The entries the renderer last sent, kept so a language switch can rebuild the
 * whole menu (including the `Open` / `Quit` entries owned by this process)
 * even when the renderer sends nothing new.
 */
let lastTrayItems: TrayMenuItem[] = [];

/** Rebuilds the tray with the last renderer entries and the new `m()` copy. */
export function rebuildTrayMenu(): void {
    if (lastTrayItems.length > 0) {
        setMenuItems(lastTrayItems);
    }
}

/**
 * (Re)builds the tray context menu from the entries the renderer asks for (see
 * `Timer.addMenuItems`). The separator and the Open/Quit entries belong to the
 * window and are appended here, so a state dependent menu can neither grey them
 * out nor reorder them. `enabled: false` renders an entry greyed out; it is how
 * the renderer says "this action cannot run right now".
 */
export function setMenuItems(items: TrayMenuItem[]) {
    if (!mGlobal.tray) {
        return;
    }

    lastTrayItems = items;

    const menuItems: MenuItemConstructorOptions[] = items
        .filter(
            (item) =>
                item != null && typeof item.label === 'string' && typeof item.enabled === 'boolean'
        )
        // The renderer builds five entries; the cap only bounds a malformed
        // payload, it never truncates a real menu.
        .slice(0, 10)
        .map(({ key, label, enabled }) => ({
            label,
            type: 'normal',
            enabled,
            click: () => {
                if (!win || win.isDestroyed()) {
                    return;
                }

                win.webContents.send(TrayEventName.Action, key);
            },
        }));
    menuItems.push(
        {
            type: 'separator',
        },
        {
            label: m('native.tray.open'),
            type: 'normal',
            click: () => {
                revealWindow();
            },
        },
        {
            label: m('native.tray.quit'),
            type: 'normal',
            click: () => {
                win = undefined;
                app.exit();
            },
        }
    );
    const contextMenu = Menu.buildFromTemplate(menuItems);
    mGlobal.tray.setContextMenu(contextMenu);
}
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
