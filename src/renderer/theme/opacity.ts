/**
 * The three window-layer opacities travel to CSS as custom properties
 * (`--pl-theme-bg-opacity`, `--pl-wallpaper-opacity`, `--pl-content-opacity`,
 * see the layer table in `Application.tsx`). These are the single writers of
 * those properties:
 *
 * - `ThemeController` calls them whenever the store reports a change
 *   (settings load, restore defaults, another window);
 * - the settings page calls them per frame while a slider is dragged, which is
 *   what makes the drag visible WITHOUT a store write -- a per-frame store
 *   update re-renders every `connect()`ed component, and once a fast drag
 *   outruns the renders, react-redux's store check schedules its re-renders
 *   from inside React's passive effects and trips the nested-update counter.
 *
 * The theme background keeps its percent unit: `SessionEndingMask` folds it
 * into a color with `max(var(--pl-theme-bg-opacity), 60%)`, which only parses
 * against a `<percentage>`.
 */

export function applyThemeBackgroundOpacity(value: number): void {
    document.documentElement.style.setProperty(
        '--pl-theme-bg-opacity',
        `${Math.round(value * 100)}%`
    );
}

export function applyWallpaperOpacity(value: number): void {
    document.documentElement.style.setProperty('--pl-wallpaper-opacity', `${value}`);
}

export function applyContentOpacity(value: number): void {
    document.documentElement.style.setProperty('--pl-content-opacity', `${value}`);
}
