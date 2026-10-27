import { applyMiddleware, legacy_createStore as createStore, Store } from 'redux';
import { thunk } from 'redux-thunk';
import { composeWithDevTools } from '@redux-devtools/extension';

import { rootReducer, RootState } from '../reducers';
import { setFollowSystemTheme, setThemeId } from '../components/Timer/action';

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

if (typeof module.hot !== 'undefined') {
    module.hot.accept('../reducers', () =>
        store.replaceReducer(require('../reducers').rootReducer)
    );
}

export default store;
