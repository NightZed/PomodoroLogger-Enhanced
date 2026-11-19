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
