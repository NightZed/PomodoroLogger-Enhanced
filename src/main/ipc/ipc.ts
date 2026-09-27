import { ipcMain, dialog, app, nativeImage, Notification, desktopCapturer, screen } from 'electron';
import * as path from 'path';
import { DesktopSourceInfo, IpcEventName, WorkerMessageType, WindowAction } from './type';
import { sendWorkerMessage } from '../worker/fork';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs';
import { writeAllFile } from '../io/write';
import { restart, win } from '../init';
import { readAllData } from '../io/read';
import { activeWin } from '../activeWin';

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
        if (!win) return;
        win.show();
        win.focus();
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
        win.setSkipTaskbar(on);
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
            // init.ts installs a close handler that hides the window to tray.
            win.close();
        }
    });
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
    handle(IpcEventName.ExportData, async () => {
        const path = await dialog.showSaveDialog({
            defaultPath: 'pomodoro-logger-exported-data.json',
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
            return;
        }

        const data = await readAllData();
        await promisify(writeFile)(path.filePath, JSON.stringify(data), { encoding: 'utf-8' });
    });

    handle(IpcEventName.ImportData, async () => {
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
            return;
        }

        const dataPath = path.filePaths[0];
        const data = JSON.parse(await promisify(readFile)(dataPath, { encoding: 'utf-8' }));
        const merged = await sendWorkerMessage({
            type: WorkerMessageType.MergeData,
            payload: {
                external: data,
                source: await readAllData(),
            },
        });

        // TODO: Show Warning
        await writeAllFile(merged.payload.merged);
        restart();
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
    handle(IpcEventName.LoadWallpaper, async (filePath: string): Promise<string> => {
        const extension = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.bmp': 'image/bmp',
            '.gif': 'image/gif',
            '.jpeg': 'image/jpeg',
            '.jpg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
        };
        const mimeType = mimeTypes[extension];
        if (!mimeType) {
            throw new Error(`Unsupported wallpaper format: ${extension || 'unknown'}`);
        }
        const image = await promisify(readFile)(filePath);
        return `data:${mimeType};base64,${image.toString('base64')}`;
    });
}
