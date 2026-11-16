# 按窗口模式统一页面卸载规则

状态：已定稿，按本文实施。
背景：v1.4.0 引入「隐藏到托盘时释放页面内存」（5eb5435），页面卸载与聚合子进程释放各用一套判据，行为不一致；`document.visibilityState` 在 Windows 上还会把「窗口被别的窗口完全盖住」报成 `hidden`，导致仅遮挡就卸载页面。

## 目标

1. 托盘的判定改由主进程下发：最小化或不可见，**不含被遮挡**。
2. 四种窗口档位共用一张卸载表，迷你模式不再走 120/300/600 秒的副作用。
3. 「今日统计」面板在进入任何非正常档位时收起（含迷你、托盘）。

不做：托盘期间丢弃 Timer 的可视子树（需要把会话执行器从组件里抽出来）；不改各页常规宽限值；不改 `forceRender`。

## 状态模型

```ts
type WindowMode = 'normal' | 'compact' | 'mini' | 'tray';

// 优先级：不可见 > 迷你 > 紧凑
deriveWindowMode({ inTray, minimize, compact }): WindowMode
```

- `inTray`：主进程在 `closeToTray` / `revealWindow` 里设定，存进 `timer` slice；不进 `settingUiStates` / `uiStateNames` / `trayStateKeys` 白名单（瞬时状态，不持久化）。
- **只有「关闭到托盘」算 `tray`**。普通最小化（`Win+↓`、标题栏最小化按钮）保持原档位：页面不卸载、worker 不提前退出、今日统计不收起——用户马上回来，期望看到的是离开时的页面。
- `minimize` / `compact`：已在 store 且互斥（`Timer/action.ts` 的 `setMinimize` / `setCompact`）。
- 托盘优先于迷你：在 90px 迷你条上点关闭走的是关闭路径，此时 `minimize` 仍为 `true`，但用户已经不在看，按 `tray` 处理。
- 从托盘恢复：`revealWindow()` 先 `restore()` 后 `show()`，`inTray` 变 `false`；若 `minimize` 仍为 `true` 则回落到 `mini`。

`WindowMode` 是派生值，不入 store。

## 卸载规则表

```ts
TAB_UNLOAD_DELAY = { kanban: 120_000, setting: 300_000, history: 600_000 };
SHORT_UNLOAD_DELAY = 30_000; // mini 与 tray 共用
```

| 页面 | normal | compact | mini | tray |
| --- | --- | --- | --- | --- |
| timer（会话执行） | 常驻 | 常驻 | 常驻 | 常驻 |
| timer 可视子树 | 完整 | 完整（紧凑布局） | 仅 `MiniLogger` | 完整但不绘制 |
| kanban | 不可见则 120s | 同 normal | 30s | 30s（开关关 → 120s） |
| setting | 不可见则 300s | 同 normal | 30s | 30s（开关关 → 300s） |
| history | 不可见则 600s | 同 normal | 30s | 30s（开关关 → 600s） |
| 今日统计面板 | 用户控制 | 收起 | 收起 | 收起 |

```ts
planPageUnload(page, mode, { currentTab, unloadOnCloseToTray }): {
    mounted: boolean;
    graceMs: number;
}
```

- `mounted` 只由「当前页」与「档位是否为 normal/compact」决定；timer 恒 `true`。
- `graceMs`：normal/compact 取该页常规宽限；mini 固定 `SHORT_UNLOAD_DELAY`；tray 取 `unloadOnCloseToTray ? SHORT : 该页常规宽限`。

### mini 固定 30s，不受开关控制

设置项文案与 hint 写的是「窗口收进托盘 30 秒后」，开关只管托盘。迷你模式下标签栏 `display: none`、`currentTab` 被强制为 `timer`，三个页面物理不可达，保留它们没有用户可见价值。30 秒而不是 0：迷你常被当作「临时缩一下」，30s 内不卸载保证「F12 缩起 → 展开 → 点回历史」仍是秒开。

### compact 不压缩

窗口可见、页面可交互。压缩宽限会让「看板 → 计时器 → 看板」每次都付一次 `fetchBoards`，是可感知的退化。

## 今日统计面板

现有规则：进入 compact 且 `more === true` → 收起。扩展为：`deriveWindowMode(...)` 从 `normal` 变成任何其他值，且 `more === true` → 收起。

两档收益性质不同：

- **tray**：Timer 完整渲染，树图和词云随收起立即卸载，是真实内存收益，比等 30 秒页面卸载更直接。
- **mini**：`more` 分支本来就不渲染（`Timer.tsx` 提前 `return <MiniLogger/>`），收起得到的是「恢复窗口后不会突然展开一个可能被裁切的面板」，与 compact 同一理由。

副作用：恢复后 `more` 是关闭的，用户需重新点「今日统计」。与 compact 现有行为一致。

## 信号链路（主进程）

```ts
let trayState = false;

function closeToTray() {
    applyTrayState(true);   // window 还可见，趁这时广播
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
        releaseWorkerNow();              // 唯一调用点
        win?.webContents.invalidate();   // 兜底 Alt+F4 的最后一帧
    }
    win?.webContents.send(WindowEventName.TrayChanged, next);
}
```

- **不监听 `minimize` / `hide` / `restore` / `show`**：`minimize` 也由用户主动最小化触发，而那条路径必须和正常页面一致。判据是「关闭的意图」，不是「窗口不可见的物理状态」。
- `windowState()` 返回 `isWindowInTray()`，供渲染层首次同步（`loadURL` 异步，push 可能错过）。

## 文案

`settings.system.unloadOnCloseToTrayHint` 要提到「历史统计的计算进程立刻退出」，用用户能懂的说法，不出现 worker / 进程 / 聚合这类词。

zh：

> 窗口收进托盘后，历史页的统计计算会立刻结束，其他页面 30 秒后释放。重新打开窗口时页面会重建，历史页需要重新计算一次。

en：

> Closing the window to the tray stops the history statistics right away and releases the other pages after 30 seconds. Reopening rebuilds them, and history recalculates.

## 测试

纯函数 `pageUnload.test.ts`（4 档 × 4 页）：

- normal 下当前页 `mounted`，其余按各自宽限；
- compact 与 normal 完全一致（防止未来被误并入压缩档）；
- mini：三页 `mounted === false`、`graceMs === 30_000`，不受开关影响；
- tray：开关开 → 30s；开关关 → 该页常规宽限；
- timer 四档恒 `mounted`；
- `deriveWindowMode`：tray 优先于 mini。

渲染层：

- `Application.test.tsx`：`setVisibility` 换成 `dispatch(setInTray(...))`；新增回归用例「`document.visibilityState` 变 hidden 不触发卸载」。
- `Timer.test.tsx`：进入 mini、进入 tray 各自收起 `more`；compact 现有用例保留。
- `fork.test.ts`：不动。

手工验证（自动化覆盖不到）：

- 最大化浏览器盖住窗口 60 秒：页面不卸载、worker 不提前退出；
- **点最小化按钮 / `Win+↓`：页面按正常宽限，worker 不提前退出，今日统计保持展开**；
- 关闭到托盘：30 秒后三页卸载、worker 立即退出；
- 迷你模式 30 秒：同上；
- 托盘恢复：历史页同帧重挂载，无空白闪烁；
- 展开今日统计后关闭到托盘，再恢复：图表不闪回（见下一节）。

## 关闭时的最后一帧

问题：展开今日统计后关闭到托盘，再恢复窗口时会看到图表残留一瞬。原因不在 React 状态，而在合成：Windows 保留窗口最后合成的那一帧并在恢复时先贴出来，而 Chromium 一旦判定窗口隐藏就不再产生新帧——`TrayChanged` 是 `minimize()` 之后才发的，收起结果进不了那一帧。

处理：

- 关闭按钮先 `announceWindowHideIntent()`（`windowHideIntent.ts`），`Timer` 同步收起面板；再等两帧 rAF 让浏览器把收起后的画面画出来，之后才发 `windowAction('close')`。
- 最小化按钮**不走**这条路径：它不改变页面内容，旧帧和恢复后的画面一致。
- `Alt+F4` 这类没有预判时机的关闭，靠 `applyTrayState(true)` 里的 `webContents.invalidate()` 兜底，属于 best effort。

## 改动清单

主进程：

- `src/main/init.ts`：`applyTrayState`（由 `closeToTray` / `revealWindow` 驱动）、`isWindowInTray()`、去掉 `releaseWorkerNow` 直挂。
- `src/main/ipc/type.ts`：`WindowEventName.TrayChanged`、`ExposedAPI.onWindowTrayChanged`、`WindowState.inTray`。
- `src/main/ipc/ipc.ts`：`WindowState` 处理器返回 `isWindowInTray()`。
- `src/main/preload.ts`：订阅转发。

渲染层：

- `src/renderer/components/pageUnload.ts`（新）：`WindowMode`、`deriveWindowMode`、`planPageUnload`、常量。
- `Timer/action.ts`：`inTray` 字段 + `setInTray`。
- `Application.tsx`：删 `state.hidden`、`onVisibilityChange`、`visibilitychange` 监听；读 `inTray` 推导 mode；三个 wrapper 用 `planPageUnload`；`windowState()` 初始化时 dispatch `setInTray`。
- `Timer/Timer.tsx`：`componentDidUpdate` 里按 mode 收起 `more`；订阅 `windowHideIntent`，关闭前收起。
- `WindowControls.tsx`：关闭按钮先广播意图、等两帧再发 IPC；最小化/最大化立即。
- `windowHideIntent.ts`（新）：意图广播模块，`Timer` 订阅、`WindowControls` 触发。

文档：

- `AGENTS.md`：页面卸载段改为四档表；标注托盘信号来源与「最小化不算托盘」。
- `src/shared/i18n/{zh,en}.ts`：hint 文案。

## 提交切分

1. `feat(main): 用主进程托盘状态替换页面可见性信号`
2. `feat(renderer): 按窗口模式统一页面卸载规则`
3. `feat(timer): 进入非正常窗口模式时收起今日统计`
4. `docs(setting): 说明托盘时历史统计的计算会立刻结束`
5. `fix(window): 关闭到托盘前先收起今日统计，避免恢复时闪回`

每步独立通过 lint / typecheck / test；第 1 步行为不变，便于定位回归。
