import type { BaseResult } from 'active-win';
import { SourceData } from '../../shared/dataMerger/dataMerger';
import type { ExportMeta } from '../../shared/dataTransfer/payload';
import type { ValidationIssue, ValidationWarning } from '../../shared/dataTransfer/validate';

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
    ActiveWin = 'activeWin',
    OpenAtLogin = 'openAtLogin',
    MinimizeWindow = 'minimizeWindow',
    CompactWindow = 'compactWindow',
    OpenDevTools = 'openDevTools',
    Notify = 'notify',
    FocusOnWindow = 'focusOnWindow',
    DesktopSource = 'desktopSource',
    WindowAction = 'windowAction',
    /** Renderer driven move of the maximized title bar, see `WindowDragPhase`. */
    WindowDrag = 'windowDrag',
    /** Window state, asked once when the renderer mounts (see `WindowState`). */
    WindowState = 'windowState',
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

/**
 * Window events pushed from the main process to the renderer.
 *
 * Kept out of `IpcEventName` for the same reason as `UpdateEventName`: the
 * bridge in `src/renderer/app.tsx` turns every `IpcEventName` into a
 * request/response call, while these are one-way notifications.
 *
 * `MaximizedChanged` carries a plain boolean (`win.isMaximized()`). It exists
 * because on Windows a *transparent* window is not a real maximized window --
 * Electron emulates it by resizing to the display work area (see
 * `NativeWindowViews::Maximize`) -- so the renderer's caption buttons cannot
 * read the state from anywhere else, and the window has to be able to report it.
 */
export enum WindowEventName {
    MaximizedChanged = 'window-maximized-changed',
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

/**
 * What an export actually did.
 *
 * The dialog is cancellable, so "wrote a file" is only one of the possible
 * outcomes and the renderer has to be able to tell them apart before it says
 * anything.
 */
export type ExportResult =
    | { status: 'cancelled' }
    | { status: 'written'; filePath: string; meta: ExportMeta };

/**
 * What an import actually did.
 *
 * `invalid` is the case this exists for: nothing was written, the file was
 * left alone, and `issues` says exactly what in it is wrong. It is reported as
 * a value rather than thrown so the renderer can show the findings in a dialog
 * instead of a rejected promise nobody handles.
 *
 * The restart is the renderer's decision (`warnings` has to be seen first),
 * so it is not done here.
 */
export type ImportResult =
    | { status: 'cancelled' }
    | { status: 'invalid'; issues: ValidationIssue[] }
    | { status: 'imported'; warnings: ValidationWarning[]; meta: ExportMeta };

export type ExposedAPI = {
    [IpcEventName.ImportData](): Promise<ImportResult>;
    [IpcEventName.SelectWallpaper](): Promise<string | undefined>;
    [IpcEventName.ExportData](): Promise<ExportResult>;
    [IpcEventName.ActiveWin](): Promise<BaseResult | undefined>;
    [IpcEventName.OpenAtLogin](on: boolean): void;
    [IpcEventName.MinimizeWindow](on: boolean): void;
    [IpcEventName.CompactWindow](on: boolean, alwaysOnTop?: boolean): void;
    [IpcEventName.OpenDevTools](): void;
    [IpcEventName.Notify](title: string, body: string, iconPath: string): void;
    [IpcEventName.FocusOnWindow](): void;
    [IpcEventName.DesktopSource](x: number, y: number): Promise<DesktopSourceInfo | undefined>;
    [IpcEventName.WindowAction](action: WindowAction): void;
    [IpcEventName.WindowDrag](phase: WindowDragPhase): void;
    [IpcEventName.WindowState](): Promise<WindowState>;
};

/**
 * Caption button actions for the frameless window, handled in ipc.ts.
 * `close` goes through init.ts's close handler, which hides the window to tray.
 */
export type WindowAction = 'minimize' | 'maximize' | 'close';

/**
 * Phase of a title bar drag the renderer drives.
 *
 * The maximized window cannot use the native drag region: on Windows a
 * transparent window is never really maximized (Electron resizes it to the work
 * area instead, see `NativeWindowViews::Maximize`), so Windows' own "dragging a
 * maximized window restores it" move never runs and the window would just be
 * carried away at full size. The title bar therefore turns the press over to
 * the renderer while the window is maximized (see `AppTitleBar`), which reports
 * only the two ends of the gesture here; the main process follows the cursor
 * itself, see `windowDrag.ts`.
 */
export type WindowDragPhase = 'start' | 'end';

/** Window state the renderer's caption buttons mirror. */
export type WindowState = {
    maximized: boolean;
};

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
