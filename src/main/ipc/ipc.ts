import {
    ipcMain,
    dialog,
    app,
    nativeImage,
    Notification,
    desktopCapturer,
    nativeTheme,
    screen,
} from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
    DesktopSourceInfo,
    ExportResult,
    ImportResult,
    IpcEventName,
    RendererErrorPayload,
    WindowDragPhase,
    WorkerMessageType,
    WindowAction,
} from './type';
import type { NativeThemeSource, TrayMenuItem } from './type';
import { sendWorkerMessage } from '../worker/fork';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs';
import * as path from 'path';
import logo from '../../res/icon_sm.png';
import { writeAllFile } from '../io/write';
import {
    revealWindow,
    rebuildTrayMenu,
    restoreWindowForError,
    setMenuItems,
    setSkipTaskbar,
    win,
} from '../init';
import { getMainLanguage, m, setMainLanguage } from '../i18n';
import type { Language } from '../../shared/i18n';
import { readAllData } from '../io/read';
import { activeWin } from '../activeWin';
import { startWindowDrag, stopWindowDrag } from './windowDrag';
import {
    buildExportFileName,
    buildExportPayload,
    unwrapImportPayload,
} from '../../shared/dataTransfer/payload';
import { validateSourceData } from '../../shared/dataTransfer/validate';
import { initializeDbIpc } from '../db/ipc';
import { openExternalUrl } from '../openExternal';
import { openDataDir } from '../openDataDir';
import { openLogDir } from '../openLogDir';
import { configureLogging, getLogDir, getSessionId, log, logError } from '../log';
import { LOG_LEVELS } from '../../shared/log';
import type { LogLevel } from '../../shared/log';
import { clearUserFiles, deleteScreenshots, saveScreenshot } from '../userFiles';
import {
    assertBoolean,
    assertOpenExternalUrl,
    assertRendererErrorPayload,
    assertOptionalBoolean,
    assertScreenshotDataUrl,
    assertScreenshotPaths,
    assertString,
    assertTrayMenuItems,
    assertOneOf,
} from './validate';
import type { Validator } from './validate';

/**
 * Only the page loaded into the app window may talk to these channels. The
 * window is never navigated away (`will-navigate` blocks it), so `event.sender`
 * remaining the main window is a strong identity check.
 */
export function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return !!win && !win.isDestroyed() && event.sender === win.webContents;
}

function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
    if (!isTrustedSender(event)) {
        console.warn('[ipc] blocked a message from an untrusted sender');
        throw new Error('Blocked IPC from an untrusted sender');
    }
}

function runValidators(validators: Validator[], args: unknown[]): void {
    for (const [index, validate] of validators.entries()) {
        validate(args[index], index);
    }
}

/** Longest block handed to the logger in one line; its detail cap is 8 KiB. */
const LOG_CHUNK_CHARS = 6000;

/**
 * Writes every finding of a refused or lossy import to `data.log`.
 *
 * The dialog shows at most 20 of them; a bug report needs the rest. Splitting
 * the list keeps each entry below the logger's per-detail cap (8 KiB), which
 * would otherwise cut it silently. One block is one log entry, so even a
 * 500-finding import costs a handful of lines -- far below the per-second cap.
 */
function logIssueChunks(
    level: LogLevel,
    headline: string,
    items: { path: string; message: string }[]
): void {
    const lines = items.map((item) => (item.path ? `${item.path}: ${item.message}` : item.message));
    const chunks: string[] = [];
    let current = '';

    for (const line of lines) {
        if (current && current.length + line.length + 1 > LOG_CHUNK_CHARS) {
            chunks.push(current);
            current = '';
        }
        current = current ? `${current}\n${line}` : line;
    }

    if (current) {
        chunks.push(current);
    }

    if (chunks.length === 0) {
        log('data', level, headline);
        return;
    }

    chunks.forEach((chunk, index) => {
        const part = chunks.length > 1 ? ` (part ${index + 1}/${chunks.length})` : '';
        log('data', level, `${headline}${part}`, chunk);
    });
}

/**
 * Registers a request/response channel. `ipcMain.handle` + `ipcRenderer.invoke`
 * replaced the old token + `event.reply('reply')` protocol: the reply now
 * belongs to the call that made it, and a thrown error rejects the renderer's
 * promise instead of being smuggled through a magic string.
 */
function handle(
    name: string,
    callback: (...args: any[]) => Promise<void> | any,
    validators: Validator[] = []
) {
    ipcMain.handle(name, async (event, ...args) => {
        assertTrustedSender(event);
        try {
            runValidators(validators, args);
            return await callback(...args);
        } catch (e) {
            logError('app', `ipc: ${name} failed`, e);
            console.error(e);
            throw e;
        }
    });
}

/** One-way commands (`ipcRenderer.send`) get the same sender/argument checks. */
export function handleCommand(
    name: string,
    callback: (...args: any[]) => void,
    validators: Validator[] = []
) {
    ipcMain.on(name, (event, ...args) => {
        if (!isTrustedSender(event)) {
            console.warn('[ipc] blocked a command from an untrusted sender');
            return;
        }
        try {
            runValidators(validators, args);
            callback(...args);
        } catch (e) {
            logError('app', `ipc command: ${name} failed`, e);
            console.error(e);
        }
    });
}

export function initialize() {
    initializeDbIpc(isTrustedSender);
    handle(IpcEventName.ActiveWin, activeWin);
    handle(IpcEventName.FocusOnWindow, () => {
        // Works while the window sits minimized in the tray as well: reveal
        // restores it first (see init.ts `revealWindow`).
        revealWindow();
    });
    handleCommand(IpcEventName.OpenExternal, (url: string) => openExternalUrl(url), [
        (value) => assertOpenExternalUrl(value),
    ]);
    handleCommand(
        IpcEventName.SetNativeTheme,
        (source: NativeThemeSource) => {
            nativeTheme.themeSource = source;
        },
        [(value) => assertOneOf(value, 'theme source', ['light', 'dark', 'system'] as const)]
    );
    /**
     * The renderer is the single source of the language switch. Rebuilding the
     * tray here (rather than waiting for the next `SetTrayMenu`) keeps the
     * dynamic entries and the `Open` / `Quit` entries in the same language even
     * when the two messages arrive in either order.
     */
    handleCommand(
        IpcEventName.SetLanguage,
        (language: Language) => {
            setMainLanguage(language);
            if (win && !win.isDestroyed()) {
                win.setTitle(m('app.title'));
            }
            rebuildTrayMenu();
        },
        [(value) => assertOneOf(value, 'language', ['en', 'zh'] as const)]
    );
    handle(IpcEventName.SaveScreenshot, (dataUrl: string) => saveScreenshot(dataUrl), [
        (value) => assertScreenshotDataUrl(value),
    ]);
    handle(IpcEventName.DeleteScreenshots, (paths: string[]) => deleteScreenshots(paths), [
        (value) => assertScreenshotPaths(value),
    ]);
    handle(IpcEventName.ClearUserFiles, async () => {
        await clearUserFiles();
        // The database tables are cleared from the renderer, so this is the
        // only trace of the deletion on the main-process side -- and the last
        // step of the flow, which makes it a good "deletion completed" mark.
        log('data', 'info', 'all user data cleared');
    });
    handle(IpcEventName.OpenDataDir, () => openDataDir());
    handle(IpcEventName.OpenLogDir, () => openLogDir());
    handle(IpcEventName.LogInfo, () => ({
        dir: getLogDir(),
        sessionId: getSessionId(),
    }));

    /**
     * Crash report from the renderer. It is written before the window is
     * restored (a restore can throw) and it is the only writer that ignores the
     * configured log level -- a crash at `error` level would otherwise leave
     * nothing behind.
     */
    handleCommand(
        IpcEventName.ReportError,
        (payload: RendererErrorPayload) => {
            // The line's own timestamp is the time the report reached the main
            // process; the renderer's ISO timestamp is deliberately not printed
            // next to it, so a line never mixes two time zones.
            const where = [
                payload.href,
                payload.tab === undefined ? undefined : `tab=${payload.tab}`,
            ]
                .filter(Boolean)
                .join(' ');
            const detail = [payload.stack, payload.componentStack]
                .filter(Boolean)
                .join('\n--- component stack ---\n');

            log(
                'crash',
                'error',
                `renderer ${payload.kind}${payload.scope ? ` (${payload.scope})` : ''}: ${
                    payload.message
                } [${where}]`,
                detail || undefined
            );

            try {
                // A crash can happen in mini/compact/maximized mode, where the
                // error page would be invisible or clipped.
                restoreWindowForError();
            } catch (error) {
                logError('crash', 'main: could not restore the window for the error page', error);
            }
        },
        [(value) => assertRendererErrorPayload(value)]
    );

    handleCommand(IpcEventName.SetLogLevel, (level: LogLevel) => configureLogging({ level }), [
        (value) => assertOneOf(value, 'log level', LOG_LEVELS),
    ]);
    /**
     * The renderer owns the timer actions, but the native tray menu lives in
     * the main process. Only serializable entries cross this boundary; a click
     * is sent back as `TrayEventName.Action`, see `init.ts setMenuItems`.
     */
    handle(
        IpcEventName.SetTrayMenu,
        (items: TrayMenuItem[]) => {
            setMenuItems(items);
        },
        [(value) => assertTrayMenuItems(value)]
    );
    /**
     * `desktopCapturer` and `screen` are main-process only since Electron 17,
     * so the renderer asks here for the capture source of the display that
     * currently hosts its window.
     *
     * The window bounds are read here, not supplied by the renderer: they used
     * to come from `@electron/remote.getCurrentWindow()` in `screenshot.ts`.
     * Only the string fields are returned: `DesktopCapturerSource.thumbnail` is
     * a `NativeImage`, which the IPC structured clone cannot serialize.
     */
    handle(IpcEventName.DesktopSource, async (): Promise<DesktopSourceInfo | undefined> => {
        if (!win || win.isDestroyed()) {
            return undefined;
        }

        const display = screen.getDisplayMatching(win.getBounds());

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 0, height: 0 },
        });

        const source = sources.find((s) => `${s.display_id}` === `${display.id}`);
        return source ? { id: source.id, display_id: source.display_id } : undefined;
    });
    handle(
        IpcEventName.Notify,
        (title: string, body: string) => {
            const notification = new Notification({
                title,
                body,
                // The renderer no longer knows a filesystem path; the main
                // process owns the app icon and resolves it from its own bundle.
                icon: nativeImage.createFromPath(path.join(__dirname, logo)),
            });
            notification.show();
        },
        [
            (value) => assertString(value, 'notification title', 200),
            (value) => assertString(value, 'notification body', 2000),
        ]
    );
    handle(IpcEventName.OpenDevTools, () => {
        if (!win) return;
        win.webContents.openDevTools({ activate: true, mode: 'detach' });
    });
    handle(
        IpcEventName.MinimizeWindow,
        (on) => {
            if (!win) return;
            win.setAlwaysOnTop(on);
            // Through init.ts' wrapper so close-to-tray can restore the state
            // the window was closed with (see `forcedSkipTaskbar`).
            setSkipTaskbar(on);
            if (on) {
                // Mini bar: content must be exactly the two-row MiniLogger size
                // (90px; Application.tsx hides the tab navigation while
                // minimized so no extra chrome remains). setContentSize keeps
                // the semantics identical to `useContentSize: true` at
                // construction -- setBounds() would set the outer frame instead
                // and shrink the content by the title bar and Windows invisible
                // resize borders.
                win.setContentSize(200, 90);
            } else {
                win.setContentSize(1440, 960);
            }
        },
        [(value) => assertBoolean(value, 'minimized')]
    );
    handle(
        IpcEventName.CompactWindow,
        (on, alwaysOnTop = true) => {
            if (!win) return;
            win.setAlwaysOnTop(on && alwaysOnTop);
            if (on) {
                win.setContentSize(370, 490);
            } else {
                win.setContentSize(1440, 960);
            }
        },
        [
            (value) => assertBoolean(value, 'compact'),
            (value) => assertOptionalBoolean(value, 'alwaysOnTop'),
        ]
    );
    // Caption buttons for the frameless window (drawn by WindowControls.tsx).
    handle(
        IpcEventName.WindowAction,
        (action: WindowAction) => {
            if (!win) return;
            if (action === 'minimize') {
                win.minimize();
            } else if (action === 'maximize') {
                if (win.isMaximized()) {
                    win.unmaximize();
                } else {
                    win.maximize();
                }
            } else if (action === 'close') {
                // init.ts installs a close handler that sends the window to
                // the tray (minimized on Windows, see `closeToTray`).
                win.close();
            }
        },
        [(value) => assertOneOf(value, 'window action', ['minimize', 'maximize', 'close'] as const)]
    );
    /**
     * The maximized title bar drives its own gesture and reports only its two
     * ends here; see `WindowDragPhase` for why the native drag region cannot
     * cover that case. The move runs in the main process (`windowDrag.ts`),
     * where the cursor can be read and the window moved without a round trip
     * per frame.
     */
    handle(
        IpcEventName.WindowDrag,
        (phase: WindowDragPhase) => {
            if (!win) return;
            if (phase === 'end') {
                stopWindowDrag();
            } else {
                startWindowDrag(win);
            }
        },
        [(value) => assertOneOf(value, 'window drag phase', ['start', 'end'] as const)]
    );
    // Asked once by the renderer when it mounts: the pushed
    // `WindowEventName.MaximizedChanged` events only report changes, and a
    // reload would otherwise have to wait for the next one to match the icon.
    handle(IpcEventName.WindowState, () => ({ maximized: win ? win.isMaximized() : false }));
    handle(
        IpcEventName.OpenAtLogin,
        (on) => {
            if (on) {
                // Electron 44 removed openAsHidden (it only worked on macOS 12);
                // login launches now use the platform default visibility.
                app.setLoginItemSettings({
                    openAtLogin: true,
                });
            } else {
                app.setLoginItemSettings({
                    openAtLogin: false,
                });
            }
        },
        [(value) => assertBoolean(value, 'openAtLogin')]
    );
    handle(IpcEventName.ExportData, async (): Promise<ExportResult> => {
        const now = new Date();
        const path = await dialog.showSaveDialog({
            // The stamp is in the file name, not only in the file: two exports
            // an hour apart are then two files instead of one being silently
            // overwritten, and a user can tell which backup is current without
            // opening anything.
            defaultPath: buildExportFileName(now),
            filters: [
                {
                    name: m('native.fileFilter.json'),
                    extensions: ['json'],
                },
                {
                    name: m('native.fileFilter.allFiles'),
                    extensions: ['*'],
                },
            ],
        });
        if (path.canceled || !path.filePath) {
            return { status: 'cancelled' };
        }

        const data = await readAllData();
        const payload = buildExportPayload(data, now);
        await promisify(writeFile)(path.filePath, JSON.stringify(payload, null, 2), {
            encoding: 'utf-8',
        });
        return {
            status: 'written',
            filePath: path.filePath,
            meta: { exportedAt: payload.exportedAt, exportedAtText: payload.exportedAtText },
        };
    });

    handle(IpcEventName.ImportData, async (): Promise<ImportResult> => {
        const selection = await dialog.showOpenDialog({
            filters: [
                {
                    name: m('native.fileFilter.json'),
                    extensions: ['json'],
                },
                {
                    name: m('native.fileFilter.allFiles'),
                    extensions: ['*'],
                },
            ],
            properties: ['openFile'],
        });
        if (selection.canceled || selection.filePaths.length === 0) {
            return { status: 'cancelled' };
        }

        const dataPath = selection.filePaths[0];
        // Only the file name reaches the log: a full path carries the user
        // name, and these files are meant to be attached to a public report.
        const fileName = path.basename(dataPath);
        const content = await promisify(readFile)(dataPath, { encoding: 'utf-8' });
        const bytes = Buffer.byteLength(content, 'utf-8');

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            // Not being JSON at all is the most common way to pick the wrong
            // file, and it deserves the same "here is what is wrong" dialog as
            // a file that is JSON but not a data file.
            log(
                'data',
                'warn',
                `import refused (not JSON) file="${fileName}" bytes=${bytes}`,
                (e as Error).message
            );
            return {
                status: 'invalid',
                issues: [
                    {
                        path: '',
                        message: m('native.importNotJson', (e as Error).message),
                    },
                ],
            };
        }

        const { data: raw, meta } = unwrapImportPayload(parsed);
        const validation = validateSourceData(raw, getMainLanguage());
        if (!validation.ok) {
            // Nothing has been touched at this point -- not the databases, not
            // the backup -- so refusing the file costs the user nothing but a
            // chance to fix it. The dialog stops at 20 findings; every recorded
            // one goes to data.log so the file can be attached to a report.
            logIssueChunks(
                'warn',
                `import refused (validation) file="${fileName}" bytes=${bytes} issues=${validation.total}`,
                validation.recordedIssues
            );
            return { status: 'invalid', issues: validation.issues };
        }

        const merged = await sendWorkerMessage({
            type: WorkerMessageType.MergeData,
            payload: {
                external: validation.data,
                source: await readAllData(),
                language: getMainLanguage(),
            },
        });

        await writeAllFile(merged.payload.merged);

        // The merger's own notes (dropped cards, ...) used to be discarded
        // here; they are the user's only warning that the merge was lossy, so
        // they travel with the result and the renderer restarts afterwards.
        const warnings = validation.warnings.concat(
            splitWarnings(merged.payload.warning).map((message) => ({
                path: 'merge',
                message,
            }))
        );

        // Same facts the dialog shows, plus counts, so a later report can say
        // what actually landed in the database.
        const counts = [
            `records=${merged.payload.merged.records.length}`,
            `move=${merged.payload.merged.move.length}`,
            `cards=${Object.keys(merged.payload.merged.cards).length}`,
            `lists=${Object.keys(merged.payload.merged.lists).length}`,
            `boards=${Object.keys(merged.payload.merged.boards).length}`,
        ].join(' ');
        const headline = `import completed file="${fileName}" bytes=${bytes} ${counts} warnings=${warnings.length}`;

        if (warnings.length > 0) {
            logIssueChunks('warn', headline, warnings);
        } else {
            log('data', 'info', headline);
        }

        return { status: 'imported', warnings, meta };
    });
    handle(IpcEventName.SelectWallpaper, async (): Promise<string | undefined> => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                {
                    name: m('native.fileFilter.images'),
                    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
                },
            ],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return undefined;
        }
        const filePath = result.filePaths[0];
        return filePath;
    });
}

/**
 * The merger collects its warnings into one newline separated string
 * (`dataHandlers.ts` concatenates what `DataMerger` reports). They are split
 * back into one entry per line here so the renderer can list them, and the
 * trailing empty line of a report ending in '\n' is dropped.
 */
function splitWarnings(warning?: string): string[] {
    if (!warning) {
        return [];
    }

    return warning
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
