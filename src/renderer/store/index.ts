import { applyMiddleware, legacy_createStore as createStore, Store } from 'redux';
import { thunk } from 'redux-thunk';
import { composeWithDevTools } from '@redux-devtools/extension';

import { rootReducer, RootState } from '../reducers';
import { setFollowSystemTheme, setLanguage, setThemeId } from '../components/Timer/action';
import { resolveLanguage, setActiveLanguage, SYSTEM_LANGUAGE } from '../i18n/runtime';

const configureStore = (): Store<RootState> => {
    const enhancer = composeWithDevTools(applyMiddleware(thunk));
    return createStore(rootReducer, enhancer);
};

const store = configureStore();

/**
 * Seed the persisted theme before the first render.
 *
 * The reducer starts on the night theme and only learns the real setting when
 * `fetchSettings()` finishes, which is long after the main process has already
 * picked `nativeTheme.themeSource`. Applying the default first made the renderer
 * push `dark` over a correct `light`, repainting the splash and DevTools dark
 * and then light again (white -> black -> white on startup). The main process
 * knows the setting before the window exists, so hand it over here instead.
 */
const initialTheme = window.api?.initialTheme;
if (initialTheme) {
    if (initialTheme.themeId) {
        store.dispatch(setThemeId(initialTheme.themeId));
    }
    store.dispatch(setFollowSystemTheme(initialTheme.followSystemTheme));
}

/**
 * Seed the persisted language before the first render, for the same reason as
 * the theme: `fetchSettings()` runs too late and the first paint would be
 * English.
 */
const initialLanguage = window.api?.initialLanguage;
if (initialLanguage) {
    store.dispatch(setLanguage(initialLanguage.language));
}

/**
 * Redux is the source of truth, the i18n runtime is the resolved value every
 * `t()` reads. Subscribing here (rather than in an effect) means the active
 * language is already switched when React re-renders after the dispatch, so no
 * frame shows the previous language.
 */
const syncLanguage = (): void => {
    setActiveLanguage(resolveLanguage(store.getState().timer.language, SYSTEM_LANGUAGE));
};

syncLanguage();
store.subscribe(syncLanguage);

if (typeof module.hot !== 'undefined') {
    module.hot.accept('../reducers', () =>
        store.replaceReducer(require('../reducers').rootReducer)
    );
}

export default store;
