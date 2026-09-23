import { ipcMain, dialog, app, nativeImage, Notification, desktopCapturer, screen } from 'electron';
import { DesktopSourceInfo, IpcEventName, WorkerMessageType } from './type';
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
    handle(IpcEventName.MinimizeWindow, (on, contentHeight) => {
        if (!win) return;
        win.setAlwaysOnTop(on);
        const { height } = win.getBounds();
        if (on) {
            win.setBounds({ height: height - contentHeight + 43, width: 366 });
        } else {
            win.setBounds({ height: 960, width: 1440 });
        }
    });
    handle(IpcEventName.CompactWindow, (on, alwaysOnTop = true) => {
        if (!win) return;
        win.setAlwaysOnTop(on && alwaysOnTop);
        if (on) {
            win.setBounds({ width: 400, height: 560 });
        } else {
            win.setBounds({ width: 1440, height: 960 });
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
}
