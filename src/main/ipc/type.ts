import type { BaseResult } from 'active-win';
import { SourceData } from '../../shared/dataMerger/dataMerger';

export enum IpcEventName {
    Quit = 'quit',
    Restart = 'restart-app',
    SetTray = 'set-tray',
    DownloadUpdate = 'download-update',
    CheckUpdate = 'check-update',
    ExportData = 'exportData',
    ImportData = 'importData',
    ActiveWin = 'activeWin',
    OpenAtLogin = 'openAtLogin',
    MinimizeWindow = 'minimizeWindow',
    OpenDevTools = 'openDevTools',
    Notify = 'notify',
    FocusOnWindow = 'focusOnWindow',
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
export type UpdatePhase = 'check' | 'download';

export type UpdateErrorPayload = {
    phase: UpdatePhase;
    message: string;
};

export type ExposedAPI = {
    [IpcEventName.ImportData](): Promise<void>;
    [IpcEventName.ExportData](): Promise<void>;
    [IpcEventName.ActiveWin](): Promise<BaseResult | undefined>;
    [IpcEventName.OpenAtLogin](on: boolean): void;
    [IpcEventName.MinimizeWindow](on: boolean, contentHeight: number): void;
    [IpcEventName.OpenDevTools](): void;
    [IpcEventName.Notify](title: string, body: string, iconPath: string): void;
    [IpcEventName.FocusOnWindow](): void;
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
