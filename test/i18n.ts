// Keeps the language in a known state between tests.
//
// `src/renderer/i18n/runtime.ts` holds the active language in module scope, so
// a test that switched it would leak into every later test in the same file.
// `test/setup-env.js` pins `navigator.language` to en-US, which is what makes
// `setActiveLanguage('en')` below match the default the suite expects.
import { setActiveLanguage } from '../src/renderer/i18n/runtime';

afterEach(() => {
    setActiveLanguage('en');
});
