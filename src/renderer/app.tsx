import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import Application from './components/Application';
import AppErrorBoundary from './components/AppErrorBoundary';
import { reportRendererError } from './errorReporting';
import { DialogMotion } from './components/AppModal';
import { ThemeController } from './components/ThemeController';
import { applyTheme, GlobalStyle, resolveTheme } from './theme';
import { applyDocumentLanguage, LanguageController } from './i18n';
import store from './store';

import './echartsSetup';

// Both are reported to `crash.log` and raise the one-time error notice, but do
// **not** replace the UI: unlike a React render failure the tree is still
// mounted and usable. Nothing here may restart the app -- that decision belongs
// to the user, on the error page.
window.addEventListener('error', (e) => {
    if (process.env.NODE_ENV === 'development') {
        console.error('[Renderer] uncaught error:', e.error || e.message);
    }
    reportRendererError('window-error', e.error || new Error(e.message), { notify: true });
});
window.addEventListener('unhandledrejection', (e) => {
    if (process.env.NODE_ENV === 'development') {
        console.error('[Renderer] unhandled rejection:', e.reason);
    }
    reportRendererError('unhandledrejection', e.reason, { notify: true });
});

// Create main element
const mainElement = document.getElementById('root');
const splashElement = document.getElementById('logo-container');
// const splashScreen = document.getElementById('logo-container');
// document.body.removeChild(splashScreen!);
// @ts-ignore
window['__@hello-pangea/dnd-disable-dev-warnings'] = true;

// Apply the persisted (or default) theme before the first render. Components
// that read the theme during their initial render (useThemeTokens) would
// otherwise see no `data-theme` attribute yet and fall back to the light
// tokens until the next theme change.
const initialTimerState = store.getState()!.timer;
const initialTheme = resolveTheme(
    initialTimerState.themeId,
    initialTimerState.followSystemTheme,
    initialTimerState.customThemes
);
applyTheme(initialTheme.tokens, initialTheme.source);
// Same for the language: `<html lang>` decides the CJK glyph variants Chromium
// picks, and it has to be right before the first paint.
applyDocumentLanguage();

// Render components
if (!mainElement) {
    throw new Error('Renderer root element was not found');
}

createRoot(mainElement).render(
    <Provider store={store}>
        <React.Fragment>
            <GlobalStyle />
            <DialogMotion />
            <ThemeController />
            <LanguageController />
            <AppErrorBoundary>
                <Application />
            </AppErrorBoundary>
        </React.Fragment>
    </Provider>
);

// The boundary removes the splash itself when the first render fails; this
// timer must therefore tolerate the node being gone already.
setTimeout(() => {
    if (!splashElement || !splashElement.isConnected) {
        return;
    }
    splashElement.style.opacity = '0';
    setTimeout(() => {
        try {
            splashElement.remove();
        } catch {
            // Already removed by the error boundary.
        }
    }, 1000);
}, 2000);
