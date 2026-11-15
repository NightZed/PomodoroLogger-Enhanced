/**
 * The store-side writer of the three window-layer opacities.
 *
 * `themeBackgroundOpacity` used to be the only value here; the wallpaper and
 * content opacities joined it when their sliders stopped writing the store per
 * frame (a drag now previews the CSS variables directly and commits once), so
 * the committed value still needs an output path -- see the layer table in
 * `Application.tsx` and the writers in `theme/opacity.ts`.
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { AnyAction, applyMiddleware, createStore, Store } from 'redux';
import { thunk, ThunkDispatch } from 'redux-thunk';

import { rootReducer, RootState } from '../reducers';
import { actions } from './Timer/action';
import { ThemeController } from './ThemeController';

describe('ThemeController opacity variables', () => {
    let store: Store<RootState>;
    // The opacity setters are thunks; the plain `Store` type only knows actions.
    let dispatch: ThunkDispatch<RootState, undefined, AnyAction>;

    const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);
    const OPACITY_VARS = [
        '--pl-content-opacity',
        '--pl-wallpaper-opacity',
        '--pl-theme-bg-opacity',
    ];

    beforeEach(() => {
        for (const name of OPACITY_VARS) {
            document.documentElement.style.removeProperty(name);
        }
        store = createStore(rootReducer, applyMiddleware(thunk));
        dispatch = store.dispatch as ThunkDispatch<RootState, undefined, AnyAction>;
        render(
            <Provider store={store}>
                <ThemeController />
            </Provider>
        );
    });

    afterEach(() => {
        cleanup();
        for (const name of OPACITY_VARS) {
            document.documentElement.style.removeProperty(name);
        }
        document.documentElement.removeAttribute('data-theme');
    });

    it('carries a committed opacity into the CSS variable its layer quotes', () => {
        act(() => {
            dispatch(actions.setContentOpacity(0.7));
            dispatch(actions.setWallpaperOpacity(0.3));
        });

        expect({ var: '--pl-content-opacity', value: cssVar('--pl-content-opacity') }).toEqual({
            var: '--pl-content-opacity',
            value: '0.7',
        });
        expect({ var: '--pl-wallpaper-opacity', value: cssVar('--pl-wallpaper-opacity') }).toEqual({
            var: '--pl-wallpaper-opacity',
            value: '0.3',
        });
    });

    // Regression: the theme background keeps its percent unit. The ending mask
    // folds it into a color with `max(var(--pl-theme-bg-opacity), 60%)`, which
    // only parses against a `<percentage>` -- a bare fraction would break that
    // expression and the mask's background with it.
    it('writes the theme background as a percentage, not a fraction', () => {
        act(() => {
            dispatch(actions.setThemeBackgroundOpacity(0.4));
        });

        expect({ var: '--pl-theme-bg-opacity', value: cssVar('--pl-theme-bg-opacity') }).toEqual({
            var: '--pl-theme-bg-opacity',
            value: '40%',
        });
    });
});
