import 'antd/dist/reset.css';
import * as React from 'react';
import { batch } from 'react-redux';
import Hotkeys from './Hotkeys';
import { connect } from 'react-redux';
import styled from 'styled-components';
import { loadDBs } from '../dbs';
import { RootState } from '../reducers';
import { genMapDispatchToProp } from '../utils';
import { DestroyOnTimeoutWrapper } from './DestroyOnTimeoutWrapper';
import { deriveWindowMode, planPageUnload } from './pageUnload';
import History from './History';
import { actions as historyActions, HistoryActionCreatorTypes } from './History/action';
import Kanban from './Kanban';
import { CardInDetail } from './Kanban/Card/CardEditor';
import { kanbanActions } from './Kanban/reducer';
import Setting from './Setting';
import Timer from './Timer';
import { actions as timerActions, tabType, TimerActionTypes } from './Timer/action';
import { setTrayImageWithMadeIcon } from './Timer/iconMaker';
import { UpdateController } from './UpdateController';
import { UserGuide } from './UserGuide/UserGuide';
import { ConnectedPomodoroSankey } from './Visualization/PomodoroSankey';
import AppTitleBar from './AppTitleBar/AppTitleBar';
import { titleBarBandHeight } from './AppTitleBar/tokens';
import { nextTabKey, planTabChange } from './appTabs';
import { getPopupContainer, POPUP_CONTAINER_ID } from './popupLayer';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { APP_FONT_FAMILY } from '../theme/tokens';
import { useThemeTokens } from '../theme/useThemeTokens';
import { useI18n } from '../i18n';
import { FeedbackContextBridge } from './feedback/Feedback';

/**
 * Window layer stack, bottom to top, and the setting that sizes each layer:
 *
 * | layer              | element                     | setting                  |
 * | ------------------ | --------------------------- | ------------------------ |
 * | window surfaces    | `Main::before` / `::after`  | `themeBackgroundOpacity` |
 * | wallpaper          | `Wallpaper`                 | `wallpaperOpacity`       |
 * | content + overlays | `Content`                   | `contentOpacity`         |
 *
 * `Main::before` paints the elevated band behind the tab bar, `Main::after` the
 * page below it: two non overlapping solid bands, so the title bar differs from
 * the page only in its base color. The wallpaper sits above both bands, which is
 * what keeps it visible through the title bar.
 *
 * Neither band uses `color-mix()` (the obvious way to fold the background
 * opacity into the color): on a window-sized surface it costs ~10 points of CPU
 * on EVERY repaint, and a live window resize repaints the whole window once per
 * frame -- measured 45% -> 33% of four cores on a 1440x960 window, with and
 * without hardware acceleration, by replacing the `color-mix()` gradient with
 * these bands. A plain `background-color` plus the element's own `opacity` is
 * the same arithmetic (each band is opaque and the setting is applied exactly
 * once, on that band only) and stays on the solid-fill fast path.
 *
 * The three settings are independent on purpose (a translucent background must
 * not dim the text, and vice versa) and each has exactly one output path: all
 * three travel as CSS custom properties (`--pl-theme-bg-opacity`,
 * `--pl-wallpaper-opacity`, `--pl-content-opacity`) written by
 * `ThemeController`. That indirection is what lets a slider drag preview
 * without touching the store: the drag writes the variable directly (no React
 * work, no re-render of this tree), and the committed value arrives here the
 * usual way. The surfaces quote the properties instead of taking the values as
 * props, so each setting has exactly one output path.
 */

/**
 * How long a page stays mounted after the user leaves it, and what the window
 * modes do to that, live in `pageUnload.ts`: the tables are a pure function so
 * the four modes can be tested without rendering the window.
 */
interface StyledProps {
    $minimize: boolean;
    $compact: boolean;
    /** The user is dragging a window edge; see the note on `border` below. */
    $resizing: boolean;
}

const Main = styled.div<StyledProps>`
    position: relative;
    height: 100vh;
    overflow: hidden;
    /* Keep a barely visible hit-test surface so transparent Windows do not
       pass pointer events through to the desktop. */
    background-color: rgba(0, 0, 0, 0.01);
    /* Single source of truth for the window corner radius: consumers that have
       to match it (MiniLogger, any future full-bleed layer) read the variable
       instead of copying the number. */
    --pl-window-radius: ${({ $minimize, $compact }) =>
        $minimize ? '10px' : $compact ? '16px' : '12px'};
    border-radius: var(--pl-window-radius);
    box-sizing: border-box;

    /* While the user drags an edge, both the radius and the ring are dropped.
       The pair costs an extra full-window composite pass on EVERY frame of the
       resize: with software rendering (hardware acceleration off) at 3.33
       megapixels one presented frame measured 9.2 ms / 55 quads with them and
       6.4 ms / 35 quads without, while either one alone changed almost nothing.
       A live resize asks for a frame about every 8 ms, so with the pass the
       window cannot keep up and visibly trails the cursor at large sizes; it can
       without it. The corners are square for the duration of the drag and come
       back RESIZE_IDLE_MS (main, init.ts) after the last resize event. */
    ${({ $resizing }) =>
        $resizing
            ? `
                border-radius: 0;
            `
            : ''}

    /* overflow: hidden + border-radius above only clip descendants whose
       containing block runs through this element -- and position: fixed
       descendants (antd's modal wrap/mask, the tour mask, the Sankey overlay,
       ...) take the viewport as their containing block instead, so opening a
       dialog painted its full-viewport mask over the transparent corners and
       the window looked square again. An ancestor with a transform IS that
       containing block, which brings every portal mounted inside this tree
       back under the rounded clip -- one rule instead of a radius patch per
       overlay (SessionEndingMask used to carry its own). translateZ(0) is the
       identity, so the geometry of those fixed layers does not move. */
    transform: translateZ(0);

    /* Height of the elevated band, i.e. the tab bar that doubles as the window
       title bar. Mini mode hides that bar, so the band collapses and the whole
       window is page surface. The numbers come from AppTitleBar/tokens.ts so
       the band and the bar can never disagree. */
    --pl-titlebar-height: ${({ $minimize, $compact }) =>
        titleBarBandHeight({ minimize: $minimize, compact: $compact })};

    /* The two window surfaces. Both are plain solid fills whose alpha is the
       element's own opacity -- see the layer table above for why they must not
       go through color-mix().

       The bands do not overlap, so each one receives themeBackgroundOpacity
       exactly once (a band painted on top of the other would apply it a second
       time and the header would end up at 2t - t squared). Both sit below the
       wallpaper, so a wallpaper keeps showing through the bar; the consequence
       is that a fully opaque wallpaper hides both bands equally, leaving the 1px
       border under the bar as the separator. */
    &::before,
    &::after {
        content: '';
        position: absolute;
        z-index: 0;
        pointer-events: none;
        opacity: var(--pl-theme-bg-opacity);
    }

    /* The elevated band behind the tab bar / title bar. */
    &::before {
        inset: 0 0 auto 0;
        height: var(--pl-titlebar-height);
        background-color: var(--pl-bg-elevated);
    }

    /* The page surface below it. Mini mode has no bar, so the band collapses
       and the whole window is page surface. */
    &::after {
        inset: var(--pl-titlebar-height) 0 0 0;
        background-color: var(--pl-bg);
    }

    ${({ $minimize, $compact }) =>
        $minimize || $compact ? 'overflow: hidden; height: 100vh;' : ''}
    /* While minimized the window is a 90px strip; dialogs are now mounted
       inside this container (see popupLayer.ts), so they have to be hidden
       while the strip is up -- otherwise a blocking dialog (maskClosable is
       false) would cover the strip and could not be clicked away. The whole
       ant-modal-root is hidden rather than just its mask and content: the
       ant-modal-wrap element is a full-viewport position:fixed box, and leaving
       it behind would keep swallowing every click on the strip.
       The tabs bar is hidden too: only its 1px bottom border would remain, and
       the strip's content height (MiniLogger 90px) must match the window
       content size exactly (see ipc.ts setContentSize). */
    .ant-tabs-nav,
    .ant-modal-root {
        ${({ $minimize }) => ($minimize ? 'display: none;' : '')}
    }
    .ant-btn-icon-only .anticon {
        transform: translateY(-0.5px);
    }

    * {
        outline: none;
    }
`;

const Wallpaper = styled.div<{ $path?: string }>`
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;

    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: ${({ $path }) => ($path ? `url("${$path}")` : 'none')};
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        opacity: var(--pl-wallpaper-opacity);
    }
`;

const Content = styled.div`
    position: relative;
    z-index: 2;
    height: 100%;
    opacity: var(--pl-content-opacity);
`;

const WindowRing = styled.div<{ $resizing: boolean }>`
    /* The window's highlight ring, on a dedicated layer above the content.
       An inset shadow on Main itself sits under the ::before/::after
       background bands (both cover the whole window at z-index 0), and the
       original real border was dropped because it occupies layout space --
       restoring it after a resize drag visibly pushed the content inward by
       1px. The shadow paints the same ring (it follows the radius) without
       being part of the layout, and pointer-events: none keeps it
       click-through. Hidden while the user drags an edge, together with the
       squared radius on Main (see the composite-pass note there). */
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: var(--pl-window-radius);
    box-shadow: inset 0 0 0 1px var(--pl-border);
    pointer-events: none;
    ${({ $resizing }) => ($resizing ? 'display: none;' : '')}
`;

interface Props extends TimerActionTypes, HistoryActionCreatorTypes {
    currentTab: string;
    minimize: boolean;
    compact: boolean;
    compactAlwaysOnTop: boolean;
    wallpaperDataUrl?: string;
    /** The ending mask is up: the pages must not be switched away from it. */
    sessionEnding: boolean;
    /**
     * The user closed the window to the tray (not a plain minimize). Pushed by
     * the main process; see `planPageUnload` for what each mode does.
     */
    inTray: boolean;
    /** Shorten the page-unload grace in the tray; see `planPageUnload`. */
    unloadOnCloseToTray: boolean;

    fetchKanban: () => void;
}

interface State {
    /**
     * Whether the window is maximized, for the caption buttons (see
     * `WindowControls`). The renderer cannot read it on its own: on Windows a
     * transparent window is not a real maximized window -- Electron emulates the
     * state by resizing to the display work area -- so the main process is the
     * only side that knows, and it reports the state on every change.
     */
    maximized: boolean;
    /**
     * The user is dragging a window edge. Dropping the rounded border for the
     * duration is worth a full-window composite pass per frame -- see the note
     * on `border` in `Main`.
     */
    resizing: boolean;
}

class Application extends React.Component<Props, State> {
    private timer = (<Timer />);
    /**
     * The user left this window in compact mode for another page, so coming back
     * to the Timer page restores it. Owned together with `planTabChange` (see
     * `appTabs.ts`), which is where the rule itself lives, and refreshed by
     * `componentDidUpdate` and by the F11 hotkey.
     */
    private returnToCompact = false;

    state: State = {
        maximized: false,
        resizing: false,
    };

    /** Unsubscribe function returned by the preload event bridge. */
    private unsubscribeWindowMaximized?: () => void;

    /** Same, for the live-resize flag (see `Main`'s border note). */
    private unsubscribeWindowResizing?: () => void;

    /** Same, for the tray state that drives the page-unload graces. */
    private unsubscribeWindowTray?: () => void;

    componentDidUpdate(prevProps: Props): void {
        if (!prevProps.compact && this.props.compact) {
            this.returnToCompact = true;
        } else if (prevProps.compact && !this.props.compact && this.props.currentTab === 'timer') {
            this.returnToCompact = false;
        }
    }

    componentDidMount(): void {
        loadDBs(['settingDB']).then(() => {
            this.props.fetchSettings();
            this.props.fetchKanban();
        });

        setTrayImageWithMadeIcon(undefined).then();

        this.unsubscribeWindowMaximized = window.api.onWindowMaximizedChanged((maximized) =>
            this.setState({ maximized })
        );
        this.unsubscribeWindowResizing = window.api.onWindowResizingChanged((resizing) =>
            this.setState({ resizing })
        );
        this.unsubscribeWindowTray = window.api.onWindowTrayChanged(this.props.setInTray);
        // Pushed events only report changes, and the window keeps its state
        // across a renderer reload: read it once for the first paint, otherwise
        // a reloaded page would show "maximize" over a maximized window -- and,
        // worse, would keep every page mounted while the window sits in the
        // tray, because no `TrayChanged` event is coming.
        window.api.windowState().then(({ maximized, inTray }) => {
            this.setState({ maximized });
            this.props.setInTray(inTray);
        });
    }

    /**
     * The one tab-switching routine: the title bar (its clicks and its
     * arrow-key navigation) and the Ctrl+Tab / Ctrl+Shift+Tab hotkeys all come
     * through here, so the three cannot disagree about what switching a page
     * does. The compact-window bookkeeping is `planTabChange`, see `appTabs.ts`
     * -- the hotkeys used to only rotate the tab id, which left the compact
     * window showing a page it is not sized for.
     *
     * Both writes below are ONE transition and have to be observed as such. The
     * hotkeys run from a native `document` keydown listener, i.e. outside
     * React's event batching, so two plain dispatches there render one after the
     * other and `componentDidUpdate` sees the half-written state in between.
     * Writing the compact flag before the tab (what this method used to do)
     * produced exactly the state its clearing rule reads as "the user left
     * compact mode on the timer page" (`compact` already off, `currentTab`
     * still 'timer'), which dropped the `returnToCompact` memory -- so Ctrl+Tab
     * out of compact mode never brought the compact window back, while a click on
     * the same tab (React batches the event) did.
     */
    changeTab = (tab: tabType) => {
        const plan = planTabChange(tab, {
            compact: this.props.compact,
            returnToCompact: this.returnToCompact,
        });

        if (plan.returnToCompact !== undefined) {
            this.returnToCompact = plan.returnToCompact;
        }

        batch(() => {
            // Page first, window mode second -- belt and braces:
            // * the `batch` makes the two writes render as one, so the
            //   half-written state never reaches `componentDidUpdate` (the
            //   native keydown listener would otherwise leave them unbatched);
            // * and even unbatched, the intermediate render would already carry
            //   the destination tab, so the clearing rule in `componentDidUpdate`
            //   (which only fires while `currentTab` is still 'timer') cannot
            //   reach the memory.
            this.props.changeAppTab(plan.tab);

            if (plan.compact !== undefined) {
                this.props.setCompact(plan.compact);
            }
        });
    };

    onKeyDown = (keyname: string) => {
        switch (keyname) {
            case 'ctrl+tab':
                // The ending mask owns the window until the finished session is
                // confirmed: switching pages there would reach the Kanban board
                // buttons, which start a session that the confirmation then
                // kills. See `TimerState.sessionEnding`.
                if (this.props.sessionEnding) {
                    break;
                }

                this.changeTab(nextTabKey(this.props.currentTab, 1));
                break;
            case 'ctrl+shift+tab':
                if (this.props.sessionEnding) {
                    break;
                }

                this.changeTab(nextTabKey(this.props.currentTab, -1));
                break;
            case 'ctrl+f12':
                window.api.openDevTools();
                break;
            case 'ctrl+q':
                window.api.quit();
                break;
            case 'f11':
                this.returnToCompact = !this.props.compact;
                this.props.setCompact(!this.props.compact);
                break;
            case 'f12':
                this.props.setMinimize(!this.props.minimize);
                break;
        }
    };

    componentWillUnmount() {
        this.unsubscribeWindowMaximized?.();
        this.unsubscribeWindowMaximized = undefined;
        this.unsubscribeWindowResizing?.();
        this.unsubscribeWindowResizing = undefined;
        this.unsubscribeWindowTray?.();
        this.unsubscribeWindowTray = undefined;
    }

    render() {
        const {
            currentTab,
            minimize,
            compact,
            compactAlwaysOnTop,
            wallpaperDataUrl,
            sessionEnding,
            setCompactAlwaysOnTop,
            unloadOnCloseToTray,
            inTray,
        } = this.props;
        // The window mode collapses the three store flags into the one value
        // the unload table is written against; the precedence (tray over mini)
        // and the per-mode graces live in `pageUnload.ts`. A page that is
        // currently on screen counts as unreachable too when the window goes to
        // the tray -- revealing it brings the page back through `mounted`, and
        // `DestroyOnTimeoutWrapper` restores it in the same commit.
        const mode = deriveWindowMode({ inTray, minimize, compact });
        const unloadOptions = { currentTab, unloadOnCloseToTray };
        const kanbanPlan = planPageUnload('kanban', mode, unloadOptions);
        const historyPlan = planPageUnload('history', mode, unloadOptions);
        const settingPlan = planPageUnload('setting', mode, unloadOptions);
        return (
            // Every antd overlay mounts into the shared popup layer by default:
            // the context makes Select, AutoComplete, Tooltip, DatePicker,
            // Dropdown and friends resolve to getPopupContainer, so they fade
            // with the page instead of escaping to <body> (popupLayer.ts).
            // An explicit container/getContainer prop on any of them still
            // wins over this default.
            <Main $minimize={minimize} $compact={compact} $resizing={this.state.resizing}>
                <Wallpaper $path={wallpaperDataUrl} />
                <Content>
                    {/* Mount point of every antd overlay (dialogs, toasts,
                        notifications, popovers). It lives inside the content
                        layer so those surfaces fade with the page instead of
                        escaping to <body>, see popupLayer.ts. */}
                    <div id={POPUP_CONTAINER_ID} />
                    <AppTitleBar
                        currentTab={currentTab}
                        minimize={minimize}
                        compact={compact}
                        maximized={this.state.maximized}
                        sessionEnding={sessionEnding}
                        alwaysOnTop={compactAlwaysOnTop}
                        onToggleAlwaysOnTop={() => setCompactAlwaysOnTop(!compactAlwaysOnTop)}
                        onTabChange={this.changeTab}
                        timer={this.timer}
                        kanban={
                            <DestroyOnTimeoutWrapper
                                isVisible={kanbanPlan.mounted}
                                timeout={kanbanPlan.graceMs}
                            >
                                <Kanban />
                            </DestroyOnTimeoutWrapper>
                        }
                        history={
                            <DestroyOnTimeoutWrapper
                                isVisible={historyPlan.mounted}
                                timeout={historyPlan.graceMs}
                            >
                                <History />
                            </DestroyOnTimeoutWrapper>
                        }
                        setting={
                            <DestroyOnTimeoutWrapper
                                isVisible={settingPlan.mounted}
                                timeout={settingPlan.graceMs}
                            >
                                <Setting />
                            </DestroyOnTimeoutWrapper>
                        }
                    />
                    {!minimize && (
                        <>
                            <UserGuide />
                            <UpdateController />
                            <CardInDetail />
                            <ConnectedPomodoroSankey />
                        </>
                    )}
                    <Hotkeys
                        keyName={'ctrl+tab,ctrl+shift+tab,ctrl+f12,ctrl+q,f11,f12'}
                        onKeyDown={this.onKeyDown}
                    />
                </Content>
                <WindowRing data-testid="window-ring" $resizing={this.state.resizing} />
            </Main>
        );
    }
}

const ApplicationContainer = connect(
    (state: RootState) => ({
        currentTab: state.timer.currentTab,
        minimize: state.timer.minimize,
        compact: state.timer.compact,
        compactAlwaysOnTop: state.timer.compactAlwaysOnTop,
        wallpaperDataUrl: state.timer.wallpaperDataUrl,
        sessionEnding: state.timer.sessionEnding,
        unloadOnCloseToTray: state.timer.unloadOnCloseToTray,
        inTray: state.timer.inTray,
    }),
    genMapDispatchToProp<
        TimerActionTypes & HistoryActionCreatorTypes & { fetchKanban: () => void }
    >({
        ...timerActions,
        ...historyActions,
        fetchKanban: kanbanActions.boardActions.fetchBoards,
    })
)(Application);

const ThemedApplication: React.FC<React.ComponentProps<typeof ApplicationContainer>> = (props) => {
    const { tokens, isDark } = useThemeTokens();
    const { language } = useI18n();
    // Nested ConfigProviders (AppTitleBar, History, ...) only override theme
    // tokens; they inherit this `locale` through antd's parent context.
    const antdLocale = language === 'zh' ? zhCN : enUS;
    const theme = React.useMemo(
        () => ({
            algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
            token: {
                fontFamily: APP_FONT_FAMILY,
                colorPrimary: tokens.primary,
                colorBgBase: tokens.bg,
                colorBgContainer: tokens.bgElevated,
                colorBgElevated: tokens.bgElevated,
                colorBgLayout: tokens.bg,
                colorText: tokens.text,
                colorTextSecondary: tokens.textSecondary,
                colorTextTertiary: tokens.textTertiary,
                colorTextPlaceholder: tokens.textTertiary,
                colorBorder: tokens.border,
                colorBorderSecondary: tokens.border,
                colorFillAlter: tokens.bgSunken,
            },
        }),
        [isDark, tokens]
    );

    return (
        <ConfigProvider
            getPopupContainer={getPopupContainer}
            locale={antdLocale}
            theme={theme}
            // antd's click ripple (`.ant-wave`) is a 2s animation. With the
            // default software rendering it makes the compositor redraw the
            // whole window at ~60fps for those two seconds: measured on
            // 2560x1410, opening the board editor from its settings button cost
            // ~1.0s CPU with the ripple and ~0.5s without it. The ripple is
            // purely decorative, so it is not worth that.
            wave={{ disabled: true }}
        >
            <AntdApp
                component={false}
                message={{ getContainer: getPopupContainer }}
                notification={{ getContainer: getPopupContainer, placement: 'topRight' }}
            >
                <FeedbackContextBridge />
                <ApplicationContainer {...props} />
            </AntdApp>
        </ConfigProvider>
    );
};

export default ThemedApplication;
