# 渲染层：状态、页面与渲染性能

> `AGENTS.md` 的「渲染层状态与 UI」区域详情。页面卸载的四档规则在 `window-modes.md`，看板在 `kanban.md`，滑块在 `settings.md`。改动 Redux 结构、页面切换、主题或窗口渲染性能前先读这里。

## Redux 结构

`src/renderer/store/index.ts` 是朴素 Redux + thunk；`src/renderer/reducers/index.ts` 合并 `timer`、`history`、`kanban`、`story`。

每个功能目录（`components/Timer`、`History`、`Kanban`、`UserGuide`）自己持有 `action.ts` + reducer + 测试——按这个模式来，**不要加横切的 slice**。

## 看板快照必须一次替换

`kanban.boards` / `lists` / `cards` 互相用 id 引用，所以整棵树重读时必须一次替换。

`applyKanbanSnapshot`（`components/Kanban/snapshot.ts`）让三个 reducer 响应同一个 action，`readKanbanSnapshot` 负责读库；导入、「删除所有数据」和看板首次加载都走它。

分成三次 dispatch 会留下「新 lists + 旧 boards」（删库时 lists 先空、boards 后空）这类中间态，任何沿 `board.lists → lists[id].cards` 走的组件都会在那一帧读到 `undefined`。

## 页面清单

`src/renderer/components/appTabs.ts` 是页面的唯一事实来源；标签栏、Ctrl+Tab 处理和紧凑模式切换全部从 `APP_TABS` / `planTabChange` 推导。

不要加一份并行的标签列表。

## 标题栏拖动

标题栏保留 `-webkit-app-region: drag`，这样普通窗口能拿到原生移动和 Aero Snap，但 Chromium 在滚动容器滚动后会把那块区域裁掉（被裁掉的条带跟着滚动容器的宽度走）。

因此任何仍能到达渲染层的标题栏按下事件都必须同时启动 `windowDrag`，否则滚动之后窗口就拖不动了——见 `src/renderer/components/AppTitleBar/dragRegion.ts` 和 `src/main/ipc/windowDrag.ts`。

## 共享组件库

`src/components/**` 是共享的可视化/小部件库（`Visualization/*`、`common/*`），渲染层用相对路径引用它——它不是渲染层自己的组件树。

## 主题

`src/renderer/theme`（tokens + `applyTheme`，CSS 自定义属性 `--pl-*`）通过 `ThemeController` 应用。

首次绘制的主题经 `additionalArguments` → `window.api.initialTheme` 跨进程边界传递，这样渲染层不会闪一下错误的主题；动启动主题时两侧都要同步改。

## 样式

样式用 styled-components（外加少量 `.scss` 全局文件）；不要为组件添加独立 CSS 文件。

## 渲染性能：两条硬约束

整个应用默认禁用硬件加速（`src/main/main.ts`）。下面两条都是在 CPU 光栅化下量出来的，换硬件加速也不会好转。

### 占满窗口的平面必须保持纯 `background-color`

实时 resize 每帧都会重绘整个窗口，在那里用 `color-mix()`（把 `themeBackgroundOpacity` 折进颜色最直觉的写法）每次重绘要吃掉四个核里约 10 个点；纯色填充 + 元素自身的 `opacity` 是同样的算术。

在 1440×960 窗口上实测 45% → 33%，开不开硬件加速都一样。

见 `Application.tsx` 里的图层表。

### resize 期间去掉圆角与高亮圈

窗口裁剪容器（`Main`）上的圆角 1px 高亮圈会让每帧多一次全窗口合成 pass，所以渲染层在窗口 resize 期间把圆角和高亮圈都去掉（`WindowEventName.ResizingChanged`，由 `init.ts` 在 120 ms 空闲计时后发出）：软件渲染下，每个呈现帧 8.8 ms → 6.5 ms，3.33 Mpx 下 55 → 37 个 quad。

高亮圈画在 Content 之上的专用覆盖层 `WindowRing`（inset box-shadow，z-index 3）而不是真实 border：border 占布局空间，拖拽松手恢复时会把内容整体往内挤 1px；而画在 Main 本体上的 inset shadow 会被 `::before` / `::after` 背景色带盖住（Main 的这两个伪元素已被 3a4526c 的背景色带占用）。

没有这个处理，大窗口做不到每个鼠标事件呈现一帧，会明显跟不上光标——也就是关掉硬件加速时那个「拉大卡顿」的报告。

**触发器是 `resize` 事件而不是 `will-resize`**（后者只对用户手势触发，脚本无法验证），代价是程序性 resize 也会触发；一次性 resize 的两步边框变化没有人手拖动遮着，会被看成窗口跳一下（v1.4.0 没有这套机制、不跳）。

所以模式切换（`MinimizeWindow` / `CompactWindow`）和最大化按钮在 resize 前先调 `init.ts` 的 `suppressResizingNotification()`（300 ms 抑制窗），这几条路径上圆角全程不动。

因此只有用户拖动期间圆角是方的。没在 trace 里量过 `Display::DrawAndSwap` 之前，不要给那个元素加回真实圆角边框或换成占布局的画法，也不要让新的程序性 resize 路径漏掉抑制调用。
