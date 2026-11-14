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
    LogInfo,
    RendererErrorPayload,
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
import type { LogLevel } from '../shared/log';
import type { DeleteKanbanItemsPayload, KanbanDeletionResult } from '../shared/kanbanDeletion';
import type { CardMoveResult, MoveCardPayload } from '../shared/cardMove';
import type { MoveCardInBoardPayload } from '../shared/cardDrag';
import type { FinishedSessionPayload, FinishedSessionResult } from '../shared/finishedSession';
import type { DataIssuesReport, DataRepairPayload, DataRepairResult } from '../shared/dataRepair';
import type {
    RecalibrateSessionHoursOptions,
    RecalibrateSessionHoursResult,
    SessionHoursReport,
} from '../shared/sessionHours';
import type {
    SessionEdit,
    SessionEditsResult,
    UnassignedSessionsQuery,
    UnassignedSessionsResult,
} from '../shared/sessionEdits';
import type { TrayActionKey } from '../renderer/components/Timer/sessionState';
import { parseInitialTheme } from './ipc/initialTheme';
import { parseInitialLanguage } from './ipc/initialLanguage';
import { parseBuildInfo } from './ipc/buildInfo';

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
    isPackaged:
        typeof process !== 'undefined' && Array.isArray(process.argv)
            ? parseBuildInfo(process.argv)
            : false,
    initialTheme:
        typeof process !== 'undefined' && Array.isArray(process.argv)
            ? parseInitialTheme(process.argv)
            : undefined,
    initialLanguage:
        typeof process !== 'undefined' && Array.isArray(process.argv)
            ? parseInitialLanguage(process.argv)
            : undefined,

    [IpcEventName.ImportData]: () => invoke<ImportResult>(IpcEventName.ImportData),
    [IpcEventName.DeleteKanbanItems]: (payload: DeleteKanbanItemsPayload) =>
        invoke<KanbanDeletionResult>(IpcEventName.DeleteKanbanItems, payload),
    [IpcEventName.ApplySessionEdits]: (edits: SessionEdit[]) =>
        invoke<SessionEditsResult>(IpcEventName.ApplySessionEdits, edits),
    [IpcEventName.ListUnassignedSessions]: (query: UnassignedSessionsQuery) =>
        invoke<UnassignedSessionsResult>(IpcEventName.ListUnassignedSessions, query),
    [IpcEventName.MoveCardToBoard]: (payload: MoveCardPayload) =>
        invoke<CardMoveResult>(IpcEventName.MoveCardToBoard, payload),
    [IpcEventName.MoveCardInBoard]: (payload: MoveCardInBoardPayload) =>
        invoke<CardMoveResult>(IpcEventName.MoveCardInBoard, payload),
    [IpcEventName.ScanDataIssues]: () => invoke<DataIssuesReport>(IpcEventName.ScanDataIssues),
    [IpcEventName.RepairData]: (payload: DataRepairPayload) =>
        invoke<DataRepairResult>(IpcEventName.RepairData, payload),
    [IpcEventName.ScanSessionHours]: () =>
        invoke<SessionHoursReport>(IpcEventName.ScanSessionHours),
    [IpcEventName.RecalibrateSessionHours]: (options: RecalibrateSessionHoursOptions) =>
        invoke<RecalibrateSessionHoursResult>(IpcEventName.RecalibrateSessionHours, options),
    [IpcEventName.RecordFinishedSession]: (payload: FinishedSessionPayload) =>
        invoke<FinishedSessionResult>(IpcEventName.RecordFinishedSession, payload),
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
    [IpcEventName.OpenDataDir]: () => invoke<void>(IpcEventName.OpenDataDir),
    [IpcEventName.OpenLogDir]: () => invoke<void>(IpcEventName.OpenLogDir),
    [IpcEventName.LogInfo]: () => invoke<LogInfo>(IpcEventName.LogInfo),
    [IpcEventName.SetTrayMenu]: (items) => invoke<void>(IpcEventName.SetTrayMenu, items),
    [IpcEventName.WindowAction]: (action: WindowAction) =>
        invoke<void>(IpcEventName.WindowAction, action),
    [IpcEventName.WindowDrag]: (phase: WindowDragPhase) =>
        invoke<void>(IpcEventName.WindowDrag, phase),
    [IpcEventName.WindowState]: () => invoke<WindowState>(IpcEventName.WindowState),

    quit: () => send(IpcEventName.Quit),
    restart: () => send(IpcEventName.Restart),
    reportError: (payload: RendererErrorPayload) => send(IpcEventName.ReportError, payload),
    setLogLevel: (level: LogLevel) => send(IpcEventName.SetLogLevel, level),
    downloadUpdate: () => send(IpcEventName.DownloadUpdate),
    checkUpdate: () => send(IpcEventName.CheckUpdate),
    installUpdate: () => send(IpcEventName.InstallUpdate),
    setTrayImage: (payload: TrayIconPayload) => send(IpcEventName.SetTray, payload),
    openExternal: (url: string) => send(IpcEventName.OpenExternal, url),
    setNativeTheme: (source) => send(IpcEventName.SetNativeTheme, source),
    setLanguage: (language) => send(IpcEventName.SetLanguage, language),

    saveScreenshot: (dataUrl: string) => invoke<string>(IpcEventName.SaveScreenshot, dataUrl),
    deleteScreenshots: (paths: string[]) => invoke<void>(IpcEventName.DeleteScreenshots, paths),
    clearUserFiles: () => invoke<void>(IpcEventName.ClearUserFiles),

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
    onWindowResizingChanged: (listener: (resizing: boolean) => void) =>
        subscribe(WindowEventName.ResizingChanged, listener),
    onTrayAction: (listener: (key: TrayActionKey) => void) =>
        subscribe(TrayEventName.Action, listener),
};

contextBridge.exposeInMainWorld('api', api);
