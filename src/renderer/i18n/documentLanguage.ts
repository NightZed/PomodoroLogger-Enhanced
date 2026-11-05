import { getActiveLanguage, t } from './runtime';

/**
 * Writes the two document level pieces of the language before the first paint.
 *
 * `<html lang>` decides which CJK glyph variants Chromium picks -- with
 * `lang="en"` Chinese can render with Japanese glyph shapes on some Windows
 * font setups, and an effect would run after the first paint. `document.title`
 * overrides the `BrowserWindow` title in Electron, so it has to agree with the
 * native title from the first frame as well.
 *
 * `LanguageController` repeats both after a runtime switch; the calls are
 * idempotent.
 */
export function applyDocumentLanguage(): void {
    const language = getActiveLanguage();
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = t('app.title');
}
