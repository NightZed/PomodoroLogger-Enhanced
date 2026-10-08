import { ipcMain, dialog, app, nativeImage, Notification, desktopCapturer, screen } from 'electron';
import {
    DesktopSourceInfo,
    ExportResult,
    ImportResult,
    IpcEventName,
    WindowDragPhase,
    WorkerMessageType,
    WindowAction,
} from './type';
import { sendWorkerMessage } from '../worker/fork';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs';
import { writeAllFile } from '../io/write';
import { revealWindow, setSkipTaskbar, win } from '../init';
import { readAllData } from '../io/read';
import { activeWin } from '../activeWin';
import { startWindowDrag, stopWindowDrag } from './windowDrag';
import {
    buildExportFileName,
    buildExportPayload,
    unwrapImportPayload,
} from '../../shared/dataTransfer/payload';
import { validateSourceData } from '../../shared/dataTransfer/validate';

/**
 * token is used to identify the sender of the message
 * @param name
 * @param callback
 */
function handle(name: string, callback: (...args: any[]) => Promise<void> | any) {
    ipcMain.on(name, async (event, token, ...args) => {
        try {
            const ans = await callback(...args);
            event.reply('reply', token, ans);
        } catch (e) {
            console.error(e);
            event.reply('reply', token, 'error', (e as any).toString());
        }
    });
}

export function initialize() {
    handle(IpcEventName.ActiveWin, activeWin);
    handle(IpcEventName.FocusOnWindow, () => {
        // Works while the window sits minimized in the tray as well: reveal
        // restores it first (see init.ts `revealWindow`).
        revealWindow();
    });
    /**
     * `desktopCapturer` and `screen` are main-process only since Electron 17,
     * so the renderer asks here for the capture source of the display that
     * currently hosts its window.
     *
     * Only the string fields are returned: `DesktopCapturerSource.thumbnail` is
     * a `NativeImage`, which the IPC structured clone cannot serialize.
     */
    handle(
        IpcEventName.DesktopSource,
        async (x: number, y: number): Promise<DesktopSourceInfo | undefined> => {
            const displays = screen.getAllDisplays();
            const display =
                displays.find(
                    (d) =>
                        x >= d.bounds.x &&
                        x <= d.bounds.x + d.bounds.width &&
                        y >= d.bounds.y &&
                        y <= d.bounds.y + d.bounds.height
                ) || screen.getPrimaryDisplay();

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 0, height: 0 },
            });

            const source = sources.find((s) => `${s.display_id}` === `${display.id}`);
            return source ? { id: source.id, display_id: source.display_id } : undefined;
        }
    );
    handle(IpcEventName.Notify, (title, body, iconPath) => {
        const notification = new Notification({
            title,
            body,
            icon: iconPath && nativeImage.createFromPath(iconPath),
        });
        notification.show();
    });
    handle(IpcEventName.OpenDevTools, () => {
        if (!win) return;
        win.webContents.openDevTools({ activate: true, mode: 'detach' });
    });
    handle(IpcEventName.MinimizeWindow, (on) => {
        if (!win) return;
        win.setAlwaysOnTop(on);
        // Through init.ts' wrapper so close-to-tray can restore the state the
        // window was closed with (see `forcedSkipTaskbar`).
        setSkipTaskbar(on);
        if (on) {
            // Mini bar: content must be exactly the two-row MiniLogger size
            // (90px; Application.tsx hides the 1px .ant-tabs-bar border while
            // minimized so no extra chrome remains). setContentSize keeps the
            // semantics identical to `useContentSize: true` at construction --
            // setBounds() would set the outer frame instead and shrink the
            // content by the title bar and Windows invisible resize borders.
            win.setContentSize(200, 90);
        } else {
            win.setContentSize(1440, 960);
        }
    });
    handle(IpcEventName.CompactWindow, (on, alwaysOnTop = true) => {
        if (!win) return;
        win.setAlwaysOnTop(on && alwaysOnTop);
        if (on) {
            win.setContentSize(370, 490);
        } else {
            win.setContentSize(1440, 960);
        }
    });
    // Caption buttons for the frameless window (drawn by WindowControls.tsx).
    handle(IpcEventName.WindowAction, (action: WindowAction) => {
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
            // init.ts installs a close handler that sends the window to the
            // tray (minimized on Windows, see `closeToTray`).
            win.close();
        }
    });
    /**
     * The maximized title bar drives its own gesture and reports only its two
     * ends here; see `WindowDragPhase` for why the native drag region cannot
     * cover that case. The move runs in the main process (`windowDrag.ts`),
     * where the cursor can be read and the window moved without a round trip
     * per frame.
     */
    handle(IpcEventName.WindowDrag, (phase: WindowDragPhase) => {
        if (!win) return;
        if (phase === 'end') {
            stopWindowDrag();
        } else {
            startWindowDrag(win);
        }
    });
    // Asked once by the renderer when it mounts: the pushed
    // `WindowEventName.MaximizedChanged` events only report changes, and a
    // reload would otherwise have to wait for the next one to match the icon.
    handle(IpcEventName.WindowState, () => ({ maximized: win ? win.isMaximized() : false }));
    handle(IpcEventName.OpenAtLogin, (on) => {
        if (on) {
            app.setLoginItemSettings({
                openAtLogin: true,
                openAsHidden: true,
            });
        } else {
            app.setLoginItemSettings({
                openAtLogin: false,
            });
        }
    });
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
                    name: 'Json',
                    extensions: ['json'],
                },
                {
                    name: 'All Files',
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
        const path = await dialog.showOpenDialog({
            filters: [
                {
                    name: 'Json',
                    extensions: ['json'],
                },
                {
                    name: 'All Files',
                    extensions: ['*'],
                },
            ],
            properties: ['openFile'],
        });
        if (path.canceled || path.filePaths.length === 0) {
            return { status: 'cancelled' };
        }

        const dataPath = path.filePaths[0];
        const content = await promisify(readFile)(dataPath, { encoding: 'utf-8' });

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            // Not being JSON at all is the most common way to pick the wrong
            // file, and it deserves the same "here is what is wrong" dialog as
            // a file that is JSON but not a data file.
            return {
                status: 'invalid',
                issues: [
                    {
                        path: '',
                        message:
                            'the file is not valid JSON: ' +
                            (e as Error).message +
                            ' (check that the file was not renamed from .json)',
                    },
                ],
            };
        }

        const { data: raw, meta } = unwrapImportPayload(parsed);
        const validation = validateSourceData(raw);
        if (!validation.ok) {
            // Nothing has been touched at this point -- not the databases, not
            // the backup -- so refusing the file costs the user nothing but a
            // chance to fix it.
            return { status: 'invalid', issues: validation.issues };
        }

        const merged = await sendWorkerMessage({
            type: WorkerMessageType.MergeData,
            payload: {
                external: validation.data,
                source: await readAllData(),
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

        return { status: 'imported', warnings, meta };
    });
    handle(IpcEventName.SelectWallpaper, async (): Promise<string | undefined> => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                {
                    name: 'Images',
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
