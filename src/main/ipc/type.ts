import type { BaseResult } from 'active-win';
import { SourceData } from '../../shared/dataMerger/dataMerger';

export enum IpcEventName {
    Quit = 'quit',
    Restart = 'restart-app',
    SetTray = 'set-tray',
    DownloadUpdate = 'download-update',
    CheckUpdate = 'check-update',
    InstallUpdate = 'install-update',
    ExportData = 'exportData',
    ImportData = 'importData',
    SelectWallpaper = 'selectWallpaper',
    LoadWallpaper = 'loadWallpaper',
    ActiveWin = 'activeWin',
    OpenAtLogin = 'openAtLogin',
    MinimizeWindow = 'minimizeWindow',
    CompactWindow = 'compactWindow',
    OpenDevTools = 'openDevTools',
    Notify = 'notify',
    FocusOnWindow = 'focusOnWindow',
    DesktopSource = 'desktopSource',
    WindowAction = 'windowAction',
}

/**
 * Events pushed from the main process to the renderer.
 *
 * They are intentionally kept out of `IpcEventName`: `src/renderer/app.tsx`
 * turns every `IpcEventName` into a request/response wrapper on `window.api`,
 * while these are one-way notifications.
 */
export enum UpdateEventName {
    Available = 'update-available',
    NotAvailable = 'update-not-available',
    Error = 'update-error',
    Progress = 'download-progress',
    Downloaded = 'update-downloaded',
}

/** Phase of the update flow the error occurred in. */
export type UpdatePhase = 'check' | 'download' | 'install';

export type UpdateErrorPayload = {
    phase: UpdatePhase;
    message: string;
    /**
     * True when the check was skipped rather than failed (for example because
     * the app is not packaged). The page that asked for the check reports it
     * itself, so the app wide error notice stays quiet.
     */
    skipped?: boolean;
};

export type ExposedAPI = {
    [IpcEventName.ImportData](): Promise<void>;
    [IpcEventName.SelectWallpaper](): Promise<string | undefined>;
    [IpcEventName.LoadWallpaper](filePath: string): Promise<string>;
    [IpcEventName.ExportData](): Promise<void>;
    [IpcEventName.ActiveWin](): Promise<BaseResult | undefined>;
    [IpcEventName.OpenAtLogin](on: boolean): void;
    [IpcEventName.MinimizeWindow](on: boolean): void;
    [IpcEventName.CompactWindow](on: boolean, alwaysOnTop?: boolean): void;
    [IpcEventName.OpenDevTools](): void;
    [IpcEventName.Notify](title: string, body: string, iconPath: string): void;
    [IpcEventName.FocusOnWindow](): void;
    [IpcEventName.DesktopSource](x: number, y: number): Promise<DesktopSourceInfo | undefined>;
    [IpcEventName.WindowAction](action: WindowAction): void;
};

/**
 * Caption button actions for the frameless window, handled in ipc.ts.
 * `close` goes through init.ts's close handler, which hides the window to tray.
 */
export type WindowAction = 'minimize' | 'maximize' | 'close';

/**
 * Identifiers of the `desktopCapturer` source that belongs to the display which
 * hosts the window at `(x, y)`.
 *
 * Only the string fields are sent over IPC: `thumbnail` is a `NativeImage` and
 * cannot be structured-cloned by the IPC layer.
 */
export type DesktopSourceInfo = {
    id: string;
    display_id: string;
};

export enum WorkerMessageType {
    MergeData = 'MergeData',
}

export type WorkerMessagePayload = {
    [WorkerMessageType.MergeData]: {
        source: 'local' | SourceData;
        external: SourceData;
    };
};

export type WorkerResponsePayload = {
    [WorkerMessageType.MergeData]: {
        merged: SourceData;
        warning?: string;
    };
};

export type WorkerMessage<T extends WorkerMessageType = WorkerMessageType> = {
    type: T;
    payload: WorkerMessagePayload[T];
    id?: number;
};

export type WorkerResponse<T extends WorkerMessageType = WorkerMessageType> = {
    type: T;
    payload: WorkerResponsePayload[T];
    id: number;
};
