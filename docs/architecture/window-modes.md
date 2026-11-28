# 窗口模式与页面卸载

> `AGENTS.md` 的「窗口档位 / 页面卸载 / 托盘」区域详情。改动页面卸载、托盘行为、今日统计收起或关闭动画前先读这里；改完回 `AGENTS.md` 核对硬约束。

页面清单本身在 `renderer.md`。本文件只讲「哪一档、卸载什么、什么时候」。

## 状态模型

```ts
type WindowMode = 'normal' | 'compact' | 'mini' | 'tray';

// 优先级：不可见 > 迷你 > 紧凑
deriveWindowMode({ inTray, minimize, compact }): WindowMode
```

- `inTray`：主进程在 `closeToTray` / `revealWindow` 里设定，存进 `timer` slice。**不进** `settingUiStates` / `uiStateNames` / `trayStateKeys` 白名单——它是瞬时状态，不持久化。
- `minimize` / `compact`：已在 store 且互斥（`Timer/action.ts` 的 `setMinimize` / `setCompact`）。
- 托盘优先于迷你：在 90px 迷你条上点关闭走的是关闭路径，此时 `minimize` 仍为 `true`，但用户已经不在看，按 `tray` 处理。
- 从托盘恢复：`revealWindow()` 先 `restore()` 后 `show()`，`inTray` 变 `false`；若 `minimize` 仍为 `true` 则回落到 `mini`。

`WindowMode` 是派生值，**不入 store**。

## 只有「关闭到托盘」算 tray

普通最小化（`Win+↓`、标题栏最小化按钮）保持原档位：页面不卸载、worker 不提前退出、今日统计不收起——用户马上回来，期望看到的是离开时的页面。

判据是「关闭的意图」，不是「窗口不可见的物理状态」。

**不要改回 `document.visibilityState`**：Windows 上窗口被其他窗口完全遮挡时它同样报 `hidden`，会把「盖住」当成「收进托盘」。

## 卸载规则表

```ts
TAB_UNLOAD_DELAY = { kanban: 120_000, setting: 300_000, history: 600_000 };
SHORT_UNLOAD_DELAY = 30_000; // mini 与 tray 共用
```

| 页面              | normal        | compact          | mini            | tray                 |
| ----------------- | ------------- | ---------------- | --------------- | -------------------- |
| timer（会话执行） | 常驻          | 常驻             | 常驻            | 常驻                 |
| timer 可视子树    | 完整          | 完整（紧凑布局） | 仅 `MiniLogger` | 完整但不绘制         |
| kanban            | 不可见则 120s | 同 normal        | 30s             | 30s（开关关 → 120s） |
| setting           | 不可见则 300s | 同 normal        | 30s             | 30s（开关关 → 300s） |
| history           | 不可见则 600s | 同 normal        | 30s             | 30s（开关关 → 600s） |
| 今日统计面板      | 用户控制      | 收起             | 收起            | 收起                 |

```ts
planPageUnload(page, mode, { currentTab, unloadOnCloseToTray }): {
    mounted: boolean;
    graceMs: number;
}
```

- `mounted` 只由「当前页」与「档位是否为 normal/compact」决定；timer 恒 `true`。
- `graceMs`：normal/compact 取该页常规宽限；mini 固定 `SHORT_UNLOAD_DELAY`；tray 取 `unloadOnCloseToTray ? SHORT : 该页常规宽限`。

规则集中在 `components/pageUnload.ts`，`Application` 只负责推导 `WindowMode` 并把结果交给 `DestroyOnTimeoutWrapper`。

各页延迟不同是有意的——history 每次 mount 都会重跑整个 `aggHistory` 聚合，kanban 只重读看板行，setting 可能还有导入/导出在飞——所以新页面需要显式加一条，**缩短延迟是行为变更，不是白捡的好处**。

`timer` 永久挂载，因为它持有正在运行的会话。

### mini 固定 30s，不受开关控制

设置项文案与 hint 写的是「窗口收进托盘 30 秒后」，开关只管托盘。

迷你模式下标签栏 `display: none`、`currentTab` 被强制为 `timer`，三个页面物理不可达，保留它们没有用户可见价值。30 秒而不是 0：迷你常被当作「临时缩一下」，30s 内不卸载保证「F12 缩起 → 展开 → 点回历史」仍是秒开。

### compact 不压缩

窗口可见、页面可交互。压缩宽限会让「看板 → 计时器 → 看板」每次都付一次 `fetchBoards`，是可感知的退化。

## 弹窗与窗口档位

迷你条隐藏整个 `.ant-modal-root`，notice 的 260px 最小宽度也放不进 200px 窗口。弹窗出现前要把窗口恢复成能显示它的形状，判定集中在 `components/feedback/attention.ts` 的 `planWindowAttention`：

| 弹窗 | normal | compact | mini | tray |
| --- | --- | --- | --- | --- |
| toast | 不动 | 不动 | 不动 | 不动 |
| 普通 notice | 不动 | 不动 | 不动 | 不动 |
| 错误 notice / confirm / alert | 不动 | 不动 | 1440×960 | 原尺寸 + 聚焦 |
| 全屏报错（`ErrorScreen`） | 只聚焦 | 1440×960 | 1440×960 | 原尺寸 + 聚焦 |

- `normal` 是主进程把窗口设为 1440×960 并 `keepWindowOnScreen`；`focus` 只 restore / show / focus，尺寸不变——紧凑窗口和用户调过大小的窗口都按关闭时的尺寸回来。
- 迷你还要 `setMinimize(false)`：只改窗口尺寸会留下迷你布局和 `display: none` 的弹窗根节点，弹窗仍然看不见。
- 恢复后留在普通窗口，不回迷你 / 托盘。
- 判定的输入是 store 的三个标志。`AppErrorBoundary` 包在 store 外面，所以渲染层每帧用 `setWindowAttentionFlags` 发布一份快照给它；主进程的 `ShowWindowForAttention` 只执行动作，不做判断。

`toast` 和普通 notice 不动，是有意的：它们是回执和状态，为了它们把窗口从迷你或托盘拉出来会让这两个档位没法用。

## 会话结束：托盘默认不弹窗口

`Timer.onDone` 只在窗口不在托盘，或设置项「会话结束时打开窗口」（`openWindowOnSessionEnd`，默认关）打开时才 `focusOnCurrentWindow()`。

开关打开时等同托盘右键「打开」：窗口按关闭时的档位恢复——迷你条仍是迷你条，紧凑仍是 370×490，普通窗口保持用户调过的尺寸——不会额外切成普通窗口。

托盘只有两个通道：变成确认用水果的托盘图标，和受 `desktopNotification` 控制的原生通知。遮罩不出现、窗口也不回来，用户可以在托盘菜单点 Start，先确认这次会话再开始下一次。

自动衔接（`autoStartWork` / `autoStartBreak`）没有确认态：`sessionEnding` 不置位，遮罩、迷你确认按钮和确认用托盘图标都不出现，托盘图标由下一场会话直接接管。普通 / 紧凑窗口也不会被拉到前台（不发出 `focusOnWindow`），只有 `openWindowOnSessionEnd` 打开时才按原档位恢复。确认与启动的细节见 `session.md`。

主进程的 `FocusOnWindow` 默认拒绝托盘里的 reveal，调用方必须带 `revealFromTray: true`（就是那个设置）才执行。渲染层的 `inTray` 副本可能落后一次推送，而「不该把窗口拉回来」这个方向不能赌它已经同步。

迷你、紧凑、普通保持原行为：迷你走 `MiniLogger` 的确认态，其余走 `TimerMask`；自动衔接打开时三者也都不进确认态。

## 未确认的会话阻止退出

会话结束到确认之间，记录只在内存里（`Timer.stagedSession`），`onSessionConfirmed` 才写库。渲染层用 `SetUnconfirmedSession` 把这个标志同步给主进程，`before-quit` 里 `shouldBlockQuit` 为真时：

```ts
event.preventDefault();
revealWindow();
win.webContents.send(WindowEventName.QuitBlocked);
```

渲染层收到 `QuitBlocked` 后把 mini / compact 复位成普通窗口，结束遮罩因此可见。处理完不自动退出。

- 所有退出入口必须走 `app.quit()`：`app.exit()` 完全跳过 `before-quit`。Ctrl+Q 和托盘「退出」原来都是 `app.exit()`，拦不住。
- `win` 的 `close` 处理器会在 `before-quit` 放行时置 `quitting`，否则 `app.quit()` 关闭窗口会让它再走一遍 `closeToTray`，退出被吞掉、窗口反而进了托盘。
- 窗口已销毁时不拦。`InstallUpdate` 先清 `win` 引用再交给 electron-updater，拦了会得到一个没有窗口、也退不掉的进程。
- Timer 卸载时把标志置回 false：崩溃页替换掉页面之后，用户仍必须能退出。

## 今日统计面板

规则：`deriveWindowMode(...)` 从 `normal` 变成任何其他值，且 `more === true` → 收起。

两档收益性质不同：

- **tray**：Timer 完整渲染，树图和词云随收起立即卸载，是真实内存收益，比等 30 秒页面卸载更直接。
- **mini**：`more` 分支本来就不渲染（`Timer.tsx` 提前 `return <MiniLogger />`），收起得到的是「恢复窗口后不会突然展开一个可能被裁切的面板」，与 compact 同一理由。

副作用：恢复后 `more` 是关闭的，用户需重新点「今日统计」。与 compact 既有行为一致。

## 主进程信号链路

```ts
let trayState = false;

function closeToTray() {
    applyTrayState(true); // window 还可见，趁这时广播
    win.minimize();
}

export function revealWindow() {
    applyTrayState(false);
    win.restore();
    win.show();
    win.focus();
}

function applyTrayState(next: boolean) {
    if (next === trayState) return;
    trayState = next;
    if (next) {
        releaseWorkerNow(); // 唯一调用点
        win?.webContents.invalidate(); // 兜底 Alt+F4 的最后一帧
    }
    win?.webContents.send(WindowEventName.TrayChanged, next);
}
```

- **不监听 `minimize` / `hide` / `restore` / `show`**：`minimize` 也由用户主动最小化触发，而那条路径必须和正常页面一致。
- `windowState()` 返回 `isWindowInTray()`，供渲染层首次同步（`loadURL` 异步，push 可能错过）。
- `applyTrayState` 是页面卸载与聚合子进程释放共用的唯一判据，`releaseWorkerNow` 只有那一个调用点。不要再各自挂窗口事件。

## 关闭时的最后一帧

问题：展开今日统计后关闭到托盘，再恢复窗口时会看到图表残留一瞬。原因不在 React 状态，而在合成：Windows 保留窗口最后合成的那一帧并在恢复时先贴出来，而 Chromium 一旦判定窗口隐藏就不再产生新帧。收起如果发生在 `minimize()` 之后，永远进不了那一帧。

处理是「先收起、再绘制、最后关窗」：

- 标题栏关闭用 `windowHideIntent.ts` 的 `requestClose()`：广播一次「即将关闭」，`Timer` 同步收起面板；等两帧 rAF（第二帧回调时第一帧的绘制已经完成），才发 `windowAction('close')`。
- `Alt+F4` 由主进程的 `before-input-event` 拦下（系统会在页面看到 keydown 之前处理它），转成 `WindowEventName.CloseRequested` 交给渲染层，走同一个 `requestClose()`。
- 最小化**不走**这条路径：它不改变页面内容，旧帧和恢复后的画面一致。

试过但无效的做法：在主进程的 `close` 事件里延迟 50ms 再 `minimize()`。窗口进入关闭流程后，这段时间内的绘制不会进到系统保留的那一帧——标题栏关闭也因此退化，所以没有保留。

## 文案

`settings.system.unloadOnCloseToTrayHint` 要提到「历史统计的计算进程立刻退出」，用用户能懂的说法，**不出现 worker / 进程 / 聚合这类词**。

zh：

> 窗口收进托盘后，历史页的统计计算会立刻结束，其他页面 30 秒后释放。重新打开窗口时页面会重建，历史页需要重新计算一次。

en：

> Closing the window to the tray stops the history statistics right away and releases the other pages after 30 seconds. Reopening rebuilds them, and history recalculates.

## 测试

`pageUnload.test.ts` 覆盖四档 × 四页：

- normal 下当前页 `mounted`，其余按各自宽限；
- compact 与 normal 完全一致（防止未来被误并入压缩档）；
- mini：三页 `mounted === false`、`graceMs === 30_000`，不受开关影响；
- tray：开关开 → 30s；开关关 → 该页常规宽限；
- timer 四档恒 `mounted`；
- `deriveWindowMode`：tray 优先于 mini。

渲染层：`Application.test.tsx` 用 `dispatch(setInTray(...))` 替代 `setVisibility`，并有回归用例「`document.visibilityState` 变 hidden 不触发卸载」；`Timer.test.tsx` 覆盖进入 mini / tray 各自收起 `more`。

自动化覆盖不到、需要手动验证的：浏览器最大化盖住窗口 60 秒不卸载；点最小化按钮 / `Win+↓` 时页面按正常宽限且今日统计保持展开；关闭到托盘 30 秒后三页卸载且 worker 立即退出；托盘恢复时历史页同帧重挂载无空白。
