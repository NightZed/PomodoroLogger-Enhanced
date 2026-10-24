import type { TrayIconPayload, TrayMenuItem } from './type';

/**
 * Small runtime validators for the preload boundary. TypeScript disappears at
 * runtime, and a compromised renderer can call any exposed method with any
 * payload, so every argument is checked before it reaches a main-process API.
 */

export type Validator = (value: unknown, index: number) => void;

export function assertString(value: unknown, name: string, maxLength = 2048): string {
    if (typeof value !== 'string' || value.length > maxLength) {
        throw new TypeError(`${name} must be a string of at most ${maxLength} characters`);
    }
    return value;
}

export function assertBoolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') {
        throw new TypeError(`${name} must be a boolean`);
    }
    return value;
}

export function assertOptionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    return assertBoolean(value, name);
}

export function assertOneOf<T extends string>(
    value: unknown,
    name: string,
    allowed: readonly T[]
): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
    }
    return value as T;
}

export function assertArray(value: unknown, name: string, maxLength: number): unknown[] {
    if (!Array.isArray(value) || value.length > maxLength) {
        throw new TypeError(`${name} must be an array of at most ${maxLength} entries`);
    }
    return value;
}

export function assertPlainObject(value: unknown, name: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${name} must be a plain object`);
    }
    return value as Record<string, unknown>;
}

export function assertTrayMenuItems(value: unknown): TrayMenuItem[] {
    const items = assertArray(value, 'tray menu items', 10);
    for (const [index, item] of items.entries()) {
        const entry = assertPlainObject(item, `tray menu item ${index}`);
        assertString(entry.key, `tray menu item ${index}.key`, 100);
        assertString(entry.label, `tray menu item ${index}.label`, 200);
        assertBoolean(entry.enabled, `tray menu item ${index}.enabled`);
    }
    return items as TrayMenuItem[];
}

export function assertTrayIconPayload(value: unknown): TrayIconPayload {
    const payload = assertPlainObject(value, 'tray icon');
    assertString(payload.src, 'tray icon.src', 5 * 1024 * 1024);
    if (typeof payload.scaleFactor !== 'number' || !Number.isFinite(payload.scaleFactor)) {
        throw new TypeError('tray icon.scaleFactor must be a finite number');
    }
    return payload as unknown as TrayIconPayload;
}

export function assertScreenshotDataUrl(value: unknown): string {
    const dataUrl = assertString(value, 'screenshot data URL', 20 * 1024 * 1024);
    if (!dataUrl.startsWith('data:image/')) {
        throw new TypeError('screenshot data URL must start with data:image/');
    }
    return dataUrl;
}

export function assertScreenshotPaths(value: unknown): string[] {
    const paths = assertArray(value, 'screenshot paths', 1000);
    for (const path of paths) {
        assertString(path, 'screenshot path', 1024);
    }
    return paths as string[];
}

export function assertKnnModel(value: unknown): Record<string, unknown> {
    const model = assertPlainObject(value, 'KNN model');
    assertPlainObject(model.encoder, 'KNN model.encoder');
    assertArray(model.encodings, 'KNN model.encodings', 1_000_000);
    if (typeof model.k !== 'number' || !Number.isFinite(model.k)) {
        throw new TypeError('KNN model.k must be a finite number');
    }
    return model;
}

export function assertOpenExternalUrl(value: unknown): string {
    const raw = assertString(value, 'external URL', 2048);
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new TypeError('external URL is malformed');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TypeError('external URL must use http: or https:');
    }
    return url.toString();
}
