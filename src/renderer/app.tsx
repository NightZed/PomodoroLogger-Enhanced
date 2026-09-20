import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { AppContainer } from 'react-hot-loader';

import Application from './components/Application';
import { ThemeController } from './components/ThemeController';
import { applyTheme, GlobalStyle, resolveTheme } from './theme';
import store from './store';

import { ipcRenderer } from 'electron';
import { IpcEventName } from '../main/ipc/type';

import './echartsSetup';

window.addEventListener('error', (e) => {
    console.error('[Renderer] uncaught error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[Renderer] unhandled rejection:', e.reason);
});

const dict: { [event: string]: Function } = {};
const msgMap: Map<string, { resolve: Function; reject: Function }> = new Map();
ipcRenderer.on('reply', (e, token, arg, err) => {
    if (arg === 'error') {
        msgMap.get(token)!.reject(err);
        console.error(err);
    } else {
        msgMap.get(token)!.resolve(arg);
        console.log(arg);
    }
    msgMap.delete(token);
});
for (const name of Object.values(IpcEventName)) {
    dict[name] = (...args: any) =>
        new Promise((resolve, reject) => {
            const token = (Math.random() * 10e10).toString(36);
            msgMap.set(token, { resolve, reject });
            ipcRenderer.send(name, token, ...args);
        });
}

console.log(dict);
(window as any).api = dict;

// Create main element
const mainElement = document.getElementById('root');
const splashElement = document.getElementById('logo-container');
// const splashScreen = document.getElementById('logo-container');
// document.body.removeChild(splashScreen!);
// @ts-ignore
window['__react-beautiful-dnd-disable-dev-warnings'] = true;

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

// Render components
const render = (Component: any) => {
    ReactDOM.render(
        <AppContainer>
            <Provider store={store}>
                <React.Fragment>
                    <GlobalStyle />
                    <ThemeController />
                    <Component />
                </React.Fragment>
            </Provider>
        </AppContainer>,
        mainElement
    );

    setTimeout(() => {
        splashElement!.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(splashElement!);
        }, 1000);
    }, 2000);
};

render(Application);
