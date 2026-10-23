import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
    DbEventName,
    IpcEventName,
    TrayEventName,
    UpdateEventName,
    WindowEventName,
} from './ipc/type';
import type {
    DesktopSourceInfo,
    ExportResult,
    ExposedAPI,
    ImportResult,
    TrayIconPayload,
    UpdateErrorPayload,
    UpdateInfoPayload,
    UpdateProgressPayload,
    WindowAction,
    WindowDragPhase,
    WindowState,
} from './ipc/type';
import type { BaseResult } from 'get-windows';
import type { DbName } from './db/types';
import type { KnnModel } from './learner/appKnn';
import type { TrayActionKey } from '../renderer/components/Timer/sessionState';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args) as Promise<T>;

const send = (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args);
};

/**
 * Wraps an `ipcRenderer` event listener and returns the matching unsubscribe
 * function. The renderer never gets the Electron event object (and therefore
 * never gets `event.sender` or any other IPC internals).
 */
function subscribe<Args extends unknown[]>(
    channel: string,
    listener: (...args: Args) => void
): () => void {
    const wrapped = (_event: IpcRendererEvent, ...args: Args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => {
        ipcRenderer.removeListener(channel, wrapped);
    };
}

/**
 * Sandboxed preload scripts have a small `process` polyfill. Keep a browser
 * fallback so the API also works if a future Electron changes that surface.
 */
function currentPlatform(): NodeJS.Platform {
    if (typeof process !== 'undefined' && process.platform) {
        return process.platform;
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (ua.includes('Mac')) {
        return 'darwin';
    }
    if (ua.includes('Win')) {
        return 'win32';
    }
    return 'linux';
}

const api: ExposedAPI = {
    platform: currentPlatform(),

    [IpcEventName.ImportData]: () => invoke<ImportResult>(IpcEventName.ImportData),
    [IpcEventName.SelectWallpaper]: () => invoke<string | undefined>(IpcEventName.SelectWallpaper),
    [IpcEventName.ExportData]: () => invoke<ExportResult>(IpcEventName.ExportData),
    [IpcEventName.ActiveWin]: () => invoke<BaseResult | undefined>(IpcEventName.ActiveWin),
    [IpcEventName.OpenAtLogin]: (on) => invoke<void>(IpcEventName.OpenAtLogin, on),
    [IpcEventName.MinimizeWindow]: (on) => invoke<void>(IpcEventName.MinimizeWindow, on),
    [IpcEventName.CompactWindow]: (on, alwaysOnTop) =>
        invoke<void>(IpcEventName.CompactWindow, on, alwaysOnTop),
    [IpcEventName.OpenDevTools]: () => invoke<void>(IpcEventName.OpenDevTools),
    [IpcEventName.Notify]: (title, body) => invoke<void>(IpcEventName.Notify, title, body),
    [IpcEventName.FocusOnWindow]: () => invoke<void>(IpcEventName.FocusOnWindow),
    [IpcEventName.DesktopSource]: () =>
        invoke<DesktopSourceInfo | undefined>(IpcEventName.DesktopSource),
    [IpcEventName.SetTrayMenu]: (items) => invoke<void>(IpcEventName.SetTrayMenu, items),
    [IpcEventName.WindowAction]: (action: WindowAction) =>
        invoke<void>(IpcEventName.WindowAction, action),
    [IpcEventName.WindowDrag]: (phase: WindowDragPhase) =>
        invoke<void>(IpcEventName.WindowDrag, phase),
    [IpcEventName.WindowState]: () => invoke<WindowState>(IpcEventName.WindowState),

    quit: () => send(IpcEventName.Quit),
    restart: () => send(IpcEventName.Restart),
    downloadUpdate: () => send(IpcEventName.DownloadUpdate),
    checkUpdate: () => send(IpcEventName.CheckUpdate),
    installUpdate: () => send(IpcEventName.InstallUpdate),
    setTrayImage: (payload: TrayIconPayload) => send(IpcEventName.SetTray, payload),
    openExternal: (url: string) => send(IpcEventName.OpenExternal, url),
    setNativeTheme: (source) => send(IpcEventName.SetNativeTheme, source),

    saveScreenshot: (dataUrl: string) => invoke<string>(IpcEventName.SaveScreenshot, dataUrl),
    deleteScreenshots: (paths: string[]) => invoke<void>(IpcEventName.DeleteScreenshots, paths),
    clearUserFiles: () => invoke<void>(IpcEventName.ClearUserFiles),
    loadKnnModel: () => invoke<KnnModel | undefined>(IpcEventName.LoadKnnModel),
    saveKnnModel: (model: KnnModel) => invoke<void>(IpcEventName.SaveKnnModel, model),

    dbReady: () => invoke<void>(DbEventName.Ready),
    dbRequest: (name: DbName, operation: string, args: unknown[]) =>
        invoke<unknown>(DbEventName.Request, name, operation, args),

    onUpdateAvailable: (listener: (info: UpdateInfoPayload) => void) =>
        subscribe(UpdateEventName.Available, listener),
    onUpdateNotAvailable: (listener: (info: string) => void) =>
        subscribe(UpdateEventName.NotAvailable, listener),
    onUpdateProgress: (listener: (progress: UpdateProgressPayload) => void) =>
        subscribe(UpdateEventName.Progress, listener),
    onUpdateDownloaded: (listener: () => void) => subscribe(UpdateEventName.Downloaded, listener),
    onUpdateError: (listener: (payload: UpdateErrorPayload) => void) =>
        subscribe(UpdateEventName.Error, listener),
    onWindowMaximizedChanged: (listener: (maximized: boolean) => void) =>
        subscribe(WindowEventName.MaximizedChanged, listener),
    onTrayAction: (listener: (key: TrayActionKey) => void) =>
        subscribe(TrayEventName.Action, listener),
};

contextBridge.exposeInMainWorld('api', api);
