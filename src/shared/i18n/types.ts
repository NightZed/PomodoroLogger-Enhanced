/** The languages the UI ships. */
export type Language = 'en' | 'zh';

/**
 * The persisted preference. `'system'` is both the default and the way of
 * saying "the user never picked a language": the main process resolves it with
 * `app.getLocale()` at startup.
 */
export type LanguagePreference = Language | 'system';

/**
 * Makes a translation catalog keep the exact shape of the English one:
 *
 *  - a missing key is a "Property 'x' is missing" error;
 *  - an extra key is caught by the excess property check on the literal;
 *  - a function whose parameter list differs is caught by the contravariance
 *    check under `strictFunctionTypes`.
 *
 * String leaves widen to `string`, which is why the source catalog must not be
 * declared `as const` -- literal types would force the translation to repeat
 * the English wording.
 */
export type CatalogShape<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => string
        ? (...args: A) => string
        : T[K] extends string
          ? string
          : CatalogShape<T[K]>;
};
