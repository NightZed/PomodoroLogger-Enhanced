import { en } from './en';

/** Every key reachable in the catalog, dot separated (`settings.system.language`). */
type KeysOf<T> = {
    [K in keyof T & string]: T[K] extends string | ((...a: any[]) => string)
        ? K
        : `${K}.${KeysOf<T[K]>}`;
}[keyof T & string];

export type MessageKey = KeysOf<typeof en>;

/** Resolves the value at a dot separated path. */
type ValueAt<T, P extends string> = P extends `${infer Head}.${infer Rest}`
    ? Head extends keyof T
        ? ValueAt<T[Head], Rest>
        : never
    : P extends keyof T
      ? T[P]
      : never;

/**
 * Keys that resolve to a plain string. Constant tables use these so a table
 * entry can never point at an interpolated message by accident.
 */
export type PlainMessageKey = {
    [K in MessageKey]: ValueAt<typeof en, K> extends string ? K : never;
}[MessageKey];

/** The interpolation arguments of a key, taken from the English catalog. */
export type MessageArgs<K extends MessageKey> =
    ValueAt<typeof en, K> extends (...args: infer A) => string ? A : [];

export interface TranslateFn {
    <K extends MessageKey>(key: K, ...args: MessageArgs<K>): string;
}
